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
  private readonly MAX_CONNECTIONS = 20; // Increased pool size
  // Timeout in milliseconds for inactive connections
  private readonly CONNECTION_TIMEOUT = 300000; // 5 minutes
  // Maximum number of reconnection attempts
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  // Reconnection delay in milliseconds (starting value)
  private readonly RECONNECT_DELAY = 2000;
  // Connection priority queue for managing connection allocation
  private connectionPriorityQueue: string[] = [];

  constructor() {
    // Increase the maximum number of listeners to avoid memory leak warnings
    this.eventEmitter.setMaxListeners(100);
  }

  onModuleInit() {
    // Start the connection cleanup interval
    setInterval(() => this.cleanupInactiveConnections(), 60000); // Check every minute
    
    // Start the connection health check interval
    setInterval(() => this.checkConnectionHealth(), 30000); // Check every 30 seconds
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
   * Connect to the IMAP server with enhanced retry logic
   * @param connectionId Connection ID
   * @param maxRetries Maximum number of retry attempts
   */
  private async connectWithRetry(
    connectionId: string,
    maxRetries: number = this.MAX_RECONNECT_ATTEMPTS,
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    let retries = 0;

    return new Promise<void>((resolve, reject) => {
      const attemptConnect = () => {
        try {
          // Update connection status to connecting
          this.updateConnectionStatus(connectionId, {
            ...this.connectionStatus.get(connectionId),
            state: 'connecting',
            lastActivity: new Date(),
          });
          
          connection.connect();

          // Set up a promise that resolves when the connection is ready
          const readyPromise = new Promise<void>((readyResolve) => {
            const readyHandler = () => {
              this.logger.log(`Connection ${connectionId} established successfully`);
              readyResolve();
            };
            
            // Use once to ensure the handler is removed after it's called
            connection.once('ready', readyHandler);
            this.eventEmitter.once(`connection:ready:${connectionId}`, readyHandler);
          });

          // Set up a promise that rejects when there's an error
          const errorPromise = new Promise<void>((_, errorReject) => {
            const errorHandler = (error) => {
              this.logger.error(`Connection ${connectionId} error: ${error.message}`);
              errorReject(error);
            };
            
            connection.once('error', errorHandler);
            this.eventEmitter.once(`connection:error:${connectionId}`, errorHandler);
          });

          // Race between ready and error events
          Promise.race([readyPromise, errorPromise])
            .then(() => {
              // Add to priority queue when connected successfully
              if (!this.connectionPriorityQueue.includes(connectionId)) {
                this.connectionPriorityQueue.push(connectionId);
              }
              resolve();
            })
            .catch((error) => {
              if (retries < maxRetries) {
                retries++;
                const backoffDelay = this.RECONNECT_DELAY * Math.pow(1.5, retries - 1); // Exponential backoff
                this.logger.log(
                  `Retrying connection ${connectionId}, attempt ${retries} in ${backoffDelay}ms`,
                );
                setTimeout(attemptConnect, backoffDelay);
              } else {
                this.logger.error(`Failed to connect after ${maxRetries} attempts: ${error.message}`);
                // Update connection status to error
                this.updateConnectionStatus(connectionId, {
                  ...this.connectionStatus.get(connectionId),
                  state: 'error',
                  error,
                  lastActivity: new Date(),
                });
                reject(error);
              }
            });
        } catch (error) {
          if (retries < maxRetries) {
            retries++;
            const backoffDelay = this.RECONNECT_DELAY * Math.pow(1.5, retries - 1); // Exponential backoff
            this.logger.log(
              `Retrying connection ${connectionId}, attempt ${retries} in ${backoffDelay}ms`,
            );
            setTimeout(attemptConnect, backoffDelay);
          } else {
            this.logger.error(`Failed to connect after ${maxRetries} attempts: ${error.message}`);
            // Update connection status to error
            this.updateConnectionStatus(connectionId, {
              ...this.connectionStatus.get(connectionId),
              state: 'error',
              error,
              lastActivity: new Date(),
            });
            reject(error);
          }
        }
      };

      attemptConnect();
    });
  }

  /**
   * Check the health of all connections and attempt to reconnect if needed
   */
  private async checkConnectionHealth(): Promise<void> {
    for (const [connectionId, status] of this.connectionStatus.entries()) {
      // Skip connections that are already in error or connecting state
      if (status.state === 'error' || status.state === 'connecting') {
        continue;
      }
      
      const connection = this.connections.get(connectionId);
      if (!connection) {
        continue;
      }
      
      // Check if connection is still alive
      if (!connection.state || connection.state === 'disconnected') {
        this.logger.log(`Connection ${connectionId} is disconnected, attempting to reconnect`);
        try {
          // Attempt to reconnect
          await this.connectWithRetry(connectionId);
        } catch (error) {
          this.logger.error(`Failed to reconnect ${connectionId}: ${error.message}`);
        }
      }
    }
  }
  
  /**
   * Get an existing IMAP connection with automatic reconnection if needed
   * @param connectionId Connection ID
   * @returns IMAP connection
   */
  async getConnection(connectionId: string): Promise<IMAP> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Check if connection is still alive
    if (!connection.state || connection.state === 'disconnected') {
      this.logger.log(`Connection ${connectionId} is disconnected, attempting to reconnect`);
      try {
        // Attempt to reconnect
        await this.connectWithRetry(connectionId, 3);
      } catch (error) {
        this.logger.error(`Failed to reconnect ${connectionId}: ${error.message}`);
        throw new Error(`Failed to reconnect: ${error.message}`);
      }
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
      
      // Remove from priority queue if present
      const queueIndex = this.connectionPriorityQueue.indexOf(oldestId);
      if (queueIndex !== -1) {
        this.connectionPriorityQueue.splice(queueIndex, 1);
      }
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
   * Get an available connection from the pool or create a new one if needed
   * @param config IMAP connection configuration
   * @returns Connection ID
   */
  async getAvailableConnection(config: ImapConnectionConfig): Promise<string> {
    // Check if we have an existing connection for this user/host combination
    for (const [connectionId, status] of this.connectionStatus.entries()) {
      if (
        status.user === config.user &&
        status.host === config.host &&
        status.port === config.port &&
        (status.state === 'connected' || status.state === 'connecting')
      ) {
        // Update last activity timestamp
        this.updateConnectionStatus(connectionId, {
          ...status,
          lastActivity: new Date(),
        });
        
        // Move to the end of the priority queue (most recently used)
        const queueIndex = this.connectionPriorityQueue.indexOf(connectionId);
        if (queueIndex !== -1) {
          this.connectionPriorityQueue.splice(queueIndex, 1);
        }
        this.connectionPriorityQueue.push(connectionId);
        
        return connectionId;
      }
    }
    
    // No existing connection found, create a new one
    return this.createConnection(config);
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
