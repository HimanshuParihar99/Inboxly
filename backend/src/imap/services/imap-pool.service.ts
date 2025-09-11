import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Imap = require('imap');
import { ImapConnectionsService } from './imap-connections.service';
import { EventEmitter } from 'events';

interface PooledConnection {
  id: string;
  imap: Imap;
  inUse: boolean;
  lastActivity: Date;
  userId: string;
}

@Injectable()
export class ImapPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImapPoolService.name);
  private readonly connectionPool: Map<string, PooledConnection> = new Map();
  private readonly connectionEvents: EventEmitter = new EventEmitter();
  private maintenanceInterval: NodeJS.Timeout;

  constructor(private readonly connectionsService: ImapConnectionsService) {}

  onModuleInit() {
    // Start the maintenance job to clean up idle connections
    this.maintenanceInterval = setInterval(() => this.performMaintenance(), 5 * 60 * 1000); // Every 5 minutes
  }

  onModuleDestroy() {
    // Clean up all connections when the module is destroyed
    clearInterval(this.maintenanceInterval);
    this.closeAllConnections();
  }

  private closeAllConnections() {
    this.logger.log(`Closing all IMAP connections in the pool`);
    for (const [id, conn] of this.connectionPool.entries()) {
      this.closeConnection(id);
    }
  }

  private performMaintenance() {
    const now = new Date();
    const idleTimeout = 10 * 60 * 1000; // 10 minutes

    this.logger.debug('Performing connection pool maintenance');

    for (const [id, conn] of this.connectionPool.entries()) {
      // If the connection has been idle for too long, close it
      if (!conn.inUse && now.getTime() - conn.lastActivity.getTime() > idleTimeout) {
        this.logger.debug(`Closing idle connection ${id}`);
        this.closeConnection(id);
      }
    }
  }

  async getConnection(connectionId: string, userId: string): Promise<Imap> {
    // Check if we already have an active connection for this ID
    const existingConn = this.connectionPool.get(connectionId);
    if (existingConn && !existingConn.inUse) {
      existingConn.inUse = true;
      existingConn.lastActivity = new Date();
      return existingConn.imap;
    }

    // If not, create a new connection
    return this.createConnection(connectionId, userId);
  }

  async createConnection(connectionId: string, userId: string): Promise<Imap> {
    // Get the connection details from the database
    const connectionDetails = await this.connectionsService.findOne(connectionId, userId);

    // Create a new IMAP connection
    const imap = new Imap({
      user: connectionDetails.username,
      password: connectionDetails.password,
      host: connectionDetails.host,
      port: connectionDetails.port,
      tls: connectionDetails.tls,
      tlsOptions: connectionDetails.tlsOptions || { rejectUnauthorized: false },
      authTimeout: 20000,
    });

    // Set up event handlers
    imap.once('ready', () => {
      this.logger.log(`Connection ${connectionId} is ready`);
      this.connectionEvents.emit(`${connectionId}:ready`);
    });

    imap.once('error', (err) => {
      this.logger.error(`Connection ${connectionId} error: ${err.message}`);
      this.connectionEvents.emit(`${connectionId}:error`, err);
      this.releaseConnection(connectionId);
    });

    imap.once('end', () => {
      this.logger.log(`Connection ${connectionId} ended`);
      this.connectionEvents.emit(`${connectionId}:end`);
      this.releaseConnection(connectionId);
    });

    // Connect to the server
    imap.connect();

    // Add to the pool
    const pooledConnection: PooledConnection = {
      id: connectionId,
      imap,
      inUse: true,
      lastActivity: new Date(),
      userId,
    };

    this.connectionPool.set(connectionId, pooledConnection);

    // Return a promise that resolves when the connection is ready
    return new Promise((resolve, reject) => {
      this.connectionEvents.once(`${connectionId}:ready`, () => {
        resolve(imap);
      });

      this.connectionEvents.once(`${connectionId}:error`, (err) => {
        reject(err);
      });

      // Set a timeout
      const timeout = setTimeout(() => {
        this.connectionEvents.removeAllListeners(`${connectionId}:ready`);
        this.connectionEvents.removeAllListeners(`${connectionId}:error`);
        reject(new Error('Connection timeout'));
      }, 30000);

      // Clear the timeout when either event fires
      const clearTimeoutFn = () => clearTimeout(timeout);
      this.connectionEvents.once(`${connectionId}:ready`, clearTimeoutFn);
      this.connectionEvents.once(`${connectionId}:error`, clearTimeoutFn);
    });
  }

  releaseConnection(connectionId: string) {
    const conn = this.connectionPool.get(connectionId);
    if (conn) {
      conn.inUse = false;
      conn.lastActivity = new Date();
    }
  }

  closeConnection(connectionId: string) {
    const conn = this.connectionPool.get(connectionId);
    if (conn) {
      try {
        conn.imap.end();
      } catch (error) {
        this.logger.error(`Error closing connection ${connectionId}: ${error.message}`);
      } finally {
        this.connectionPool.delete(connectionId);
        this.connectionEvents.removeAllListeners(`${connectionId}:ready`);
        this.connectionEvents.removeAllListeners(`${connectionId}:error`);
        this.connectionEvents.removeAllListeners(`${connectionId}:end`);
      }
    }
  }
}