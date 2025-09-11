import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import IMAP = require('imap');
import {
  ImapConnectionConfig,
  ImapConnectionStatus,
  ImapFolder,
} from '../interfaces/imap-connection.interface';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for managing IMAP connections
 * Implements connection pooling and handles different authentication methods
 */
@Injectable()
export class ImapConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapConnectionService.name);
  private connections: Map<string, IMAP> = new Map();
  private connectionStatus: Map<string, ImapConnectionStatus> = new Map();
  private readonly eventEmitter: EventEmitter = new EventEmitter();

  // Maximum number of connections to maintain in the pool
  private readonly MAX_CONNECTIONS = 10;
  // Timeout in milliseconds for inactive connections
  private readonly CONNECTION_TIMEOUT = 300000; // 5 minutes

  constructor() {
    // Increase the maximum number of listeners to avoid memory leak warnings
    this.eventEmitter.setMaxListeners(100);
  }

  onModuleInit() {
    // Start the connection cleanup interval
    setInterval(() => this.cleanupInactiveConnections(), 60000); // Check every minute
  }

  onModuleDestroy() {
    // Close all connections when the module is destroyed
    this.closeAllConnections();
  }

  /**
   * Get the number of active connections
   * @returns Number of active connections
   */
  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  /**
   * Get folders for a connection
   * @param connectionId Connection ID
   * @returns List of folders
   */
  async getFolders(connectionId: string): Promise<ImapFolder[]> {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    return new Promise((resolve, reject) => {
      connection.getBoxes((err: Error | null, boxes: Record<string, any>) => {
        if (err) {
          reject(err);
          return;
        }
        // Process the boxes recursively
        const processBoxes = (
          boxesObj: Record<string, any>,
          path: string = '',
        ): ImapFolder[] => {
          return Object.keys(boxesObj).map((name: string) => {
            const box: any = boxesObj[name];
            const fullPath = path
              ? `${path}${connection.delimiter}${name}`
              : name;
            return {
              name,
              path: fullPath,
              delimiter: connection.delimiter,
              attribs: Array.isArray(box.attribs) ? [...box.attribs] : [],
              children:
                box.children && typeof box.children === 'object'
                  ? processBoxes(box.children as Record<string, any>, fullPath)
                  : undefined,
            };
          });
        };
        const folders = processBoxes(boxes);
        resolve(folders);
      });
    });
  }

  /**
   * Create a new IMAP connection
   * @param config IMAP connection configuration
   * @returns Connection ID
   * @throws Error if connection fails
   */
  async createConnection(config: ImapConnectionConfig): Promise<string> {
    if (
      !config ||
      !config.user ||
      !config.password ||
      !config.host ||
      !config.port
    ) {
      throw new Error(
        'Invalid IMAP connection configuration: missing required fields',
      );
    }

    const connectionId = uuidv4();

    // Check if we've reached the maximum number of connections
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      this.logger.warn(
        `Maximum number of connections (${this.MAX_CONNECTIONS}) reached. Closing oldest connection.`,
      );
      this.closeOldestConnection();
    }

    try {
      // Create IMAP connection with the provided configuration
      const imapConfig: IMAP.Config = {
        user: config.user,
        password: config.password,
        host: config.host,
        port: config.port,
        tls: config.tls,
        authTimeout: config.authTimeout || 30000,
        connTimeout: config.connTimeout || 30000,
        debug: config.debug,
        tlsOptions: config.tlsOptions,
        // Handle different authentication methods
        ...(config.authMethod && { authMethod: config.authMethod }),
        ...(config.accessToken && { xoauth2: config.accessToken }),
      };

      const connection = new IMAP(imapConfig);

      // Set up event listeners
      connection.once('ready', () => {
        this.logger.log(
          `Connection ${connectionId} established to ${config.host}:${config.port}`,
        );
        this.updateConnectionStatus(connectionId, {
          id: connectionId,
          host: config.host,
          port: config.port,
          user: config.user,
          state: 'connected',
          lastActivity: new Date(),
        });
        this.eventEmitter.emit('connection:ready', connectionId);
      });

      connection.once('error', (err) => {
        this.logger.error(`Connection ${connectionId} error: ${err.message}`);
        this.updateConnectionStatus(connectionId, {
          id: connectionId,
          host: config.host,
          port: config.port,
          user: config.user,
          state: 'error',
          error: err,
          lastActivity: new Date(),
        });
        this.eventEmitter.emit('connection:error', {
          connectionId,
          error: err,
        });
      });

      connection.once('end', () => {
        this.logger.log(`Connection ${connectionId} ended`);
        this.updateConnectionStatus(connectionId, {
          id: connectionId,
          host: config.host,
          port: config.port,
          user: config.user,
          state: 'disconnected',
          lastActivity: new Date(),
        });
        this.eventEmitter.emit('connection:end', connectionId);
      });

      // Store the connection in the pool
      this.connections.set(connectionId, connection);

      // Update connection status
      this.updateConnectionStatus(connectionId, {
        id: connectionId,
        host: config.host,
        port: config.port,
        user: config.user,
        state: 'connecting',
        lastActivity: new Date(),
      });

      // Connect to the IMAP server
      await this.connectWithRetry(connectionId, 3);

      return connectionId;
    } catch (error) {
      this.logger.error(`Failed to create connection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to the IMAP server with retry logic
   * @param connectionId Connection ID
   * @param maxRetries Maximum number of retry attempts
   */
  private async connectWithRetry(
    connectionId: string,
    maxRetries: number,
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    let retries = 0;

    return new Promise<void>((resolve, reject) => {
      const attemptConnect = () => {
        try {
          connection.connect();

          // Set up a promise that resolves when the connection is ready
          const readyPromise = new Promise<void>((readyResolve) => {
            this.eventEmitter.once(`connection:ready:${connectionId}`, () => {
              readyResolve();
            });
          });

          // Set up a promise that rejects when there's an error
          const errorPromise = new Promise<void>((_, errorReject) => {
            this.eventEmitter.once(
              `connection:error:${connectionId}`,
              (error) => {
                errorReject(error);
              },
            );
          });

          // Race between ready and error events
          Promise.race([readyPromise, errorPromise])
            .then(() => resolve())
            .catch((error) => {
              if (retries < maxRetries) {
                retries++;
                this.logger.log(
                  `Retrying connection ${connectionId}, attempt ${retries}`,
                );
                setTimeout(attemptConnect, 2000 * retries); // Exponential backoff
              } else {
                reject(error);
              }
            });
        } catch (error) {
          if (retries < maxRetries) {
            retries++;
            this.logger.log(
              `Retrying connection ${connectionId}, attempt ${retries}`,
            );
            setTimeout(attemptConnect, 2000 * retries); // Exponential backoff
          } else {
            reject(error);
          }
        }
      };

      attemptConnect();
    });
  }

  /**
   * Get an existing IMAP connection
   * @param connectionId Connection ID
   * @returns IMAP connection
   */
  getConnection(connectionId: string): IMAP {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Update last activity timestamp
    const status = this.connectionStatus.get(connectionId);
    if (status) {
      status.lastActivity = new Date();
      this.connectionStatus.set(connectionId, status);
    }

    return connection;
  }

  /**
   * Close an IMAP connection
   * @param connectionId Connection ID
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    return new Promise<void>((resolve) => {
      connection.once('end', () => {
        this.connections.delete(connectionId);
        this.connectionStatus.delete(connectionId);
        resolve();
      });

      connection.end();
    });
  }

  /**
   * Close the oldest inactive connection
   * @returns True if a connection was closed, false otherwise
   */
  private closeOldestConnection(): boolean {
    let oldestId: string | null = null;
    let oldestTime = Date.now();

    // Find the oldest connection based on last activity time
    this.connectionStatus.forEach((status, id) => {
      if (status.lastActivity && status.lastActivity.getTime() < oldestTime) {
        oldestId = id;
        oldestTime = status.lastActivity.getTime();
      }
    });

    // Close the oldest connection if found
    if (oldestId) {
      this.closeConnection(oldestId);
      return true;
    }

    // If no inactive connection found, close any connection
    if (this.connections.size > 0) {
      const firstId = Array.from(this.connections.keys())[0];
      this.closeConnection(firstId);
      return true;
    }

    return false;
  }

  /**
   * Close all IMAP connections
   */
  private async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.keys()).map(
      (connectionId) => {
        return this.closeConnection(connectionId);
      },
    );

    await Promise.all(closePromises);
  }

  /**
   * Clean up inactive connections
   */
  private async cleanupInactiveConnections(): Promise<void> {
    const now = new Date();
    const connectionIds = Array.from(this.connectionStatus.keys());

    for (const connectionId of connectionIds) {
      const status = this.connectionStatus.get(connectionId);
      if (!status) continue;

      const inactiveTime = now.getTime() - status.lastActivity.getTime();

      // Close connections that have been inactive for too long
      if (inactiveTime > this.CONNECTION_TIMEOUT) {
        this.logger.log(`Closing inactive connection ${connectionId}`);
        await this.closeConnection(connectionId);
      }
    }
  }

  /**
   * Update connection status
   * @param connectionId Connection ID
   * @param status Connection status
   */
  private updateConnectionStatus(
    connectionId: string,
    status: ImapConnectionStatus,
  ): void {
    this.connectionStatus.set(connectionId, status);
  }

  /**
   * Get connection status
   * @param connectionId Connection ID
   * @returns Connection status
   */
  getConnectionStatus(connectionId: string): ImapConnectionStatus | undefined {
    return this.connectionStatus.get(connectionId);
  }

  /**
   * Get all connection statuses
   * @returns Array of connection statuses
   */
  getAllConnectionStatuses(): ImapConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  /**
   * List mailbox folders
   * @param connectionId Connection ID
   * @returns Array of IMAP folders
   */
  async listFolders(connectionId: string): Promise<ImapFolder[]> {
    const connection = this.getConnection(connectionId);

    return new Promise<ImapFolder[]>((resolve, reject) => {
      connection.getBoxes((err, boxes) => {
        if (err) {
          reject(err);
          return;
        }

        const folders: ImapFolder[] = this.parseBoxes(boxes);
        resolve(folders);
      });
    });
  }

  /**
   * Parse IMAP mailbox structure into folder hierarchy
   * @param boxes IMAP mailbox structure
   * @param path Current path
   * @returns Array of IMAP folders
   */
  private parseBoxes(boxes: IMAP.MailBoxes, path: string = ''): ImapFolder[] {
    const folders: ImapFolder[] = [];

    for (const name in boxes) {
      const box = boxes[name];
      const folderPath = path ? `${path}${box.delimiter}${name}` : name;

      const folder: ImapFolder = {
        name,
        path: folderPath,
        delimiter: box.delimiter,
        attribs: box.attribs,
      };

      if (box.children) {
        folder.children = this.parseBoxes(box.children, folderPath);
      }

      folders.push(folder);
    }

    return folders;
  }
}
