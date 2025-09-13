import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IMAP = require('imap');
import { ImapConnectionConfig, ImapConnectionStatus, ImapFolder } from '../interfaces/imap-connection.interface';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImapConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapConnectionService.name);
  private connections: Map<string, IMAP> = new Map();
  private connectionStatus: Map<string, ImapConnectionStatus> = new Map();
  private readonly eventEmitter: EventEmitter = new EventEmitter();

  private readonly MAX_CONNECTIONS = 20;
  private readonly CONNECTION_TIMEOUT = 300_000; // 5 minutes
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 2000;

  private connectionPriorityQueue: string[] = [];

  constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  onModuleInit() {
    setInterval(() => this.cleanupInactiveConnections(), 60_000);
    setInterval(() => this.checkConnectionHealth(), 30_000);
  }

  onModuleDestroy() {
    this.closeAllConnections();
  }

  /** ------------------------- Public Methods ------------------------- */

  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  async getConnection(connectionId: string): Promise<IMAP> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Connection ${connectionId} not found`);

    if (!connection.state || connection.state === 'disconnected') {
      this.logger.log(`Connection ${connectionId} is disconnected. Reconnecting...`);
      await this.connectWithRetry(connectionId);
    }

    const status = this.connectionStatus.get(connectionId);
    if (status) status.lastActivity = new Date();

    return connection;
  }

  async getAvailableConnection(config: ImapConnectionConfig): Promise<string> {
    for (const [connectionId, status] of this.connectionStatus.entries()) {
      if (
        status.user === config.user &&
        status.host === config.host &&
        status.port === config.port &&
        ['connected', 'connecting'].includes(status.state)
      ) {
        status.lastActivity = new Date();
        this.connectionPriorityQueue = this.connectionPriorityQueue.filter(id => id !== connectionId);
        this.connectionPriorityQueue.push(connectionId);
        return connectionId;
      }
    }

    return this.createConnection(config);
  }

  async getFolders(connectionId: string): Promise<ImapFolder[]> {
    const connection = await this.getConnection(connectionId);
    return new Promise<ImapFolder[]>((resolve, reject) => {
      connection.getBoxes((err, boxes) => {
        if (err) return reject(err);
        resolve(this.parseFolders(boxes, '', connection.delimiter));
      });
    });
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    return new Promise<void>((resolve) => {
      connection.once('end', () => {
        this.connections.delete(connectionId);
        this.connectionStatus.delete(connectionId);
        this.connectionPriorityQueue = this.connectionPriorityQueue.filter(id => id !== connectionId);
        resolve();
      });
      connection.end();
    });
  }

  getConnectionStatus(connectionId: string): ImapConnectionStatus | undefined {
    return this.connectionStatus.get(connectionId);
  }

  getAllConnectionStatuses(): ImapConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  /** ------------------------- Private Methods ------------------------- */

  private async createConnection(config: ImapConnectionConfig): Promise<string> {
    if (!config || !config.user || !config.password || !config.host || !config.port) {
      throw new Error('Invalid IMAP configuration: missing required fields');
    }

    const connectionId = uuidv4();

    if (this.connections.size >= this.MAX_CONNECTIONS) {
      this.logger.warn(`Max connections reached. Closing oldest connection.`);
      this.closeOldestConnection();
    }

    const imapConfig: IMAP.Config = {
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      authTimeout: config.authTimeout || 30_000,
      connTimeout: config.connTimeout || 30_000,
      debug: config.debug,
      tlsOptions: config.tlsOptions,
      ...(config.authMethod && { authMethod: config.authMethod }),
      ...(config.accessToken && { xoauth2: config.accessToken }),
    };

    const connection = new IMAP(imapConfig);

    connection.once('ready', () => {
      this.logger.log(`Connection ${connectionId} established to ${config.host}:${config.port}`);
      this.updateConnectionStatus(connectionId, {
        id: connectionId,
        host: config.host,
        port: config.port,
        user: config.user,
        state: 'connected',
        lastActivity: new Date(),
      });
      this.eventEmitter.emit(`connection:ready:${connectionId}`);
    });

    connection.once('error', (err) => {
      this.logger.error(`Connection ${connectionId} error: ${err.message}`);
      this.updateConnectionStatus(connectionId, {
        ...this.connectionStatus.get(connectionId),
        state: 'error',
        error: err,
        lastActivity: new Date(),
      });
      this.eventEmitter.emit(`connection:error:${connectionId}`, err);
    });

    connection.once('end', () => {
      this.logger.log(`Connection ${connectionId} ended`);
      this.updateConnectionStatus(connectionId, {
        ...this.connectionStatus.get(connectionId),
        state: 'disconnected',
        lastActivity: new Date(),
      });
    });

    this.connections.set(connectionId, connection);
    this.updateConnectionStatus(connectionId, {
      id: connectionId,
      host: config.host,
      port: config.port,
      user: config.user,
      state: 'connecting',
      lastActivity: new Date(),
    });

    await this.connectWithRetry(connectionId);
    return connectionId;
  }

  private async connectWithRetry(connectionId: string, maxRetries = this.MAX_RECONNECT_ATTEMPTS): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Connection ${connectionId} not found`);

    let retries = 0;

    const attemptConnect = (): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const readyHandler = () => {
          this.connectionPriorityQueue.push(connectionId);
          resolve();
        };

        const errorHandler = (err: Error) => {
          if (retries < maxRetries) {
            retries++;
            const delay = this.RECONNECT_DELAY * Math.pow(1.5, retries - 1);
            this.logger.log(`Retrying ${connectionId} in ${delay}ms (attempt ${retries})`);
            setTimeout(() => attemptConnect().then(resolve).catch(reject), delay);
          } else {
            reject(err);
          }
        };

        connection.once('ready', readyHandler);
        connection.once('error', errorHandler);
        connection.connect();
      });
    };

    await attemptConnect();
  }

  private parseFolders(boxes: IMAP.MailBoxes, path = '', delimiter = '/'): ImapFolder[] {
    return Object.entries(boxes).map(([name, box]: [string, any]) => {
      const folderPath = path ? `${path}${delimiter}${name}` : name;
      return {
        name,
        path: folderPath,
        delimiter: box.delimiter || delimiter,
        attribs: Array.isArray(box.attribs) ? [...box.attribs] : [],
        children: box.children ? this.parseFolders(box.children, folderPath, box.delimiter || delimiter) : undefined,
      };
    });
  }

  private async checkConnectionHealth(): Promise<void> {
    for (const [connectionId, status] of this.connectionStatus.entries()) {
      if (['error', 'connecting'].includes(status.state)) continue;

      const connection = this.connections.get(connectionId);
      if (!connection || !connection.state || connection.state === 'disconnected') {
        this.logger.log(`Reconnecting disconnected connection ${connectionId}`);
        await this.connectWithRetry(connectionId).catch(err =>
          this.logger.error(`Failed to reconnect ${connectionId}: ${err.message}`)
        );
      }
    }
  }

  private async cleanupInactiveConnections(): Promise<void> {
    const now = Date.now();
    const inactiveIds = Array.from(this.connectionStatus.entries())
      .filter(([_, status]) => now - status.lastActivity.getTime() > this.CONNECTION_TIMEOUT)
      .map(([id]) => id);

    await Promise.all(inactiveIds.map(id => this.closeConnection(id)));
  }

  private closeOldestConnection(): void {
    const oldest = Array.from(this.connectionStatus.entries())
      .reduce<{ id: string; time: number } | null>((acc, [id, status]) => {
        const lastTime = status.lastActivity.getTime();
        if (!acc || lastTime < acc.time) return { id, time: lastTime };
        return acc;
      }, null);

    if (oldest) this.closeConnection(oldest.id);
  }

  private updateConnectionStatus(connectionId: string, status: ImapConnectionStatus) {
    this.connectionStatus.set(connectionId, status);
  }

  private async closeAllConnections(): Promise<void> {
    await Promise.all(Array.from(this.connections.keys()).map(id => this.closeConnection(id)));
  }
}
