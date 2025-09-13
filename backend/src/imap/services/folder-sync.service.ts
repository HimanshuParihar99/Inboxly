import { Injectable, Logger } from '@nestjs/common';
import { ImapConnectionService } from './imap-connection.service';
import { ImapFolder, MessageFlags } from '../interfaces/imap-connection.interface';
import * as IMAP from 'imap';

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);
  private syncInProgress = new Map<string, boolean>();
  private pausedSyncs = new Map<string, boolean>();

  constructor(private readonly imapConnectionService: ImapConnectionService) {}

  /**
   * Synchronize folders between source and destination IMAP servers
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   */
  async syncFolders(
    sourceConnectionId: string,
    destConnectionId: string,
  ): Promise<void> {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    
    // Check if sync is already in progress
    if (this.syncInProgress.get(syncKey)) {
      this.logger.log(`Sync already in progress for ${syncKey}`);
      return;
    }
    
    // Check if sync is paused
    if (this.pausedSyncs.get(syncKey)) {
      this.logger.log(`Sync is paused for ${syncKey}`);
      return;
    }
    
    try {
      this.syncInProgress.set(syncKey, true);
      
      // Get connections
      const sourceConnection = await this.imapConnectionService.getConnection(sourceConnectionId);
      const destConnection = await this.imapConnectionService.getConnection(destConnectionId);
      
      // Get folder list from source
      const sourceFolders = await this.getFolders(sourceConnection);
      
      // Get folder list from destination
      const destFolders = await this.getFolders(destConnection);
      
      // Create missing folders in destination
      await this.createMissingFolders(destConnection, sourceFolders, destFolders);
      
      // Sync messages for each folder
      for (const folder of sourceFolders) {
        // Check if sync was paused during operation
        if (this.pausedSyncs.get(syncKey)) {
          this.logger.log(`Sync paused during operation for ${syncKey}`);
          break;
        }
        
        await this.syncFolderMessages(
          sourceConnection,
          destConnection,
          folder.path,
        );
      }
      
      this.logger.log(`Folder sync completed for ${syncKey}`);
    } catch (error) {
      this.logger.error(`Error syncing folders: ${error.message}`, error.stack);
      throw error;
    } finally {
      this.syncInProgress.set(syncKey, false);
    }
  }

  /**
   * Pause an ongoing sync operation
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   */
  pauseSync(sourceConnectionId: string, destConnectionId: string): void {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    this.pausedSyncs.set(syncKey, true);
    this.logger.log(`Sync paused for ${syncKey}`);
  }

  /**
   * Resume a paused sync operation
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   */
  resumeSync(sourceConnectionId: string, destConnectionId: string): void {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    this.pausedSyncs.set(syncKey, false);
    this.logger.log(`Sync resumed for ${syncKey}`);
    
    // If sync is not in progress, start it again
    if (!this.syncInProgress.get(syncKey)) {
      this.syncFolders(sourceConnectionId, destConnectionId);
    }
  }

  /**
   * Get folders from IMAP connection
   * @param connection IMAP connection
   * @returns List of folders
   */
  private getFolders(connection: IMAP): Promise<ImapFolder[]> {
    return new Promise((resolve, reject) => {
      connection.getBoxes((err, boxes) => {
        if (err) {
          reject(err);
          return;
        }
        
        const folders: ImapFolder[] = [];
        this.parseFolderHierarchy(boxes, '', folders);
        resolve(folders);
      });
    });
  }

  /**
   * Parse folder hierarchy recursively
   * @param boxes IMAP boxes
   * @param parentPath Parent path
   * @param folders Folders array to populate
   * @param delimiter Folder delimiter
   */
  private parseFolderHierarchy(
    boxes: IMAP.MailBoxes,
    parentPath: string,
    folders: ImapFolder[],
    delimiter = '/',
  ): void {
    for (const name in boxes) {
      if (Object.prototype.hasOwnProperty.call(boxes, name)) {
        const box = boxes[name];
        const path = parentPath ? `${parentPath}${delimiter}${name}` : name;
        
        // Handle special characters in folder names
        const sanitizedName = this.sanitizeFolderName(name);
        
        folders.push({
          name: sanitizedName,
          path,
          delimiter,
          attribs: box.attribs,
          children: [],
        });
        
        // Process children recursively
        if (box.children) {
          this.parseFolderHierarchy(
            box.children,
            path,
            folders,
            delimiter,
          );
        }
      }
    }
  }

  /**
   * Sanitize folder name to handle special characters
   * @param name Folder name
   * @returns Sanitized folder name
   */
  private sanitizeFolderName(name: string): string {
    // Replace problematic characters with safe alternatives
    // This is important for cross-server compatibility
    return name
      .replace(/\//g, '-') // Replace forward slashes
      .replace(/\\/g, '-') // Replace backslashes
      .replace(/\*/g, '_') // Replace asterisks
      .replace(/\?/g, '_') // Replace question marks
      .replace(/"/g, '\'') // Replace double quotes with single quotes
      .replace(/</g, '(') // Replace < with (
      .replace(/>/g, ')') // Replace > with )
      .replace(/\|/g, '_'); // Replace pipes
  }

  /**
   * Create missing folders in destination
   * @param destConnection Destination IMAP connection
   * @param sourceFolders Source folders
   * @param destFolders Destination folders
   */
  private async createMissingFolders(
    destConnection: IMAP,
    sourceFolders: ImapFolder[],
    destFolders: ImapFolder[],
  ): Promise<void> {
    const destFolderPaths = destFolders.map((folder) => folder.path);
    
    // Sort folders by path length to ensure parent folders are created first
    const sortedSourceFolders = [...sourceFolders].sort(
      (a, b) => a.path.length - b.path.length,
    );
    
    for (const folder of sortedSourceFolders) {
      if (!destFolderPaths.includes(folder.path)) {
        try {
          await this.createFolder(destConnection, folder.path);
          this.logger.log(`Created folder: ${folder.path}`);
        } catch (error) {
          this.logger.error(
            `Error creating folder ${folder.path}: ${error.message}`,
            error.stack,
          );
        }
      }
    }
  }

  /**
   * Create a folder in IMAP connection
   * @param connection IMAP connection
   * @param path Folder path
   */
  private createFolder(connection: IMAP, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.addBox(path, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Synchronize messages between source and destination folders
   * @param sourceConnection Source IMAP connection
   * @param destConnection Destination IMAP connection
   * @param folderPath Folder path
   */
  private async syncFolderMessages(
    sourceConnection: IMAP,
    destConnection: IMAP,
    folderPath: string,
  ): Promise<void> {
    try {
      // Open source folder
      const sourceBox = await this.openFolder(sourceConnection, folderPath);
      
      // Open destination folder
      await this.openFolder(destConnection, folderPath);
      
      // If no messages in source, nothing to sync
      if (sourceBox.messages.total === 0) {
        return;
      }
      
      // Fetch message UIDs and headers from source
      const messages = await this.fetchMessages(sourceConnection, '1:*', {
        bodies: 'HEADER',
        envelope: true,
        flags: true,
        date: true,
      });
      
      // Process each message
      for (const message of messages) {
        await this.copyMessageWithFlags(
          sourceConnection,
          destConnection,
          message,
          folderPath,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error syncing folder ${folderPath}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Open a folder in IMAP connection
   * @param connection IMAP connection
   * @param path Folder path
   * @param readOnly Read-only mode
   * @returns Mailbox information
   */
  private openFolder(
    connection: IMAP,
    path: string,
    readOnly = false,
  ): Promise<IMAP.Box> {
    return new Promise((resolve, reject) => {
      connection.openBox(path, readOnly, (err, box) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(box);
      });
    });
  }

  /**
   * Fetch messages from IMAP connection
   * @param connection IMAP connection
   * @param source Message source (e.g., '1:*')
   * @param options Fetch options
   * @returns List of messages
   */
  private fetchMessages(
    connection: IMAP,
    source: string,
    options: IMAP.FetchOptions,
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const fetch = connection.fetch(source, options);
      
      fetch.on('message', (msg, seqno) => {
        const message: any = {
          seqno,
          attributes: null,
          headers: null,
        };
        
        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          
          stream.on('end', () => {
            if (info.which === 'HEADER') {
              message.headers = buffer;
            }
          });
        });
        
        msg.once('attributes', (attrs) => {
          message.attributes = attrs;
        });
        
        msg.once('end', () => {
          messages.push(message);
        });
      });
      
      fetch.once('error', (err) => {
        reject(err);
      });
      
      fetch.once('end', () => {
        resolve(messages);
      });
    });
  }

  /**
   * Copy a message with its flags from source to destination
   * @param sourceConnection Source IMAP connection
   * @param destConnection Destination IMAP connection
   * @param message Message to copy
   * @param folderPath Folder path
   */
  private async copyMessageWithFlags(
    sourceConnection: IMAP,
    destConnection: IMAP,
    message: any,
    folderPath: string,
  ): Promise<void> {
    try {
      // Check if message already exists in destination by comparing headers
      const existingMessages = await this.fetchMessages(destConnection, '1:*', {
        bodies: 'HEADER',
      });
      
      // Compare message headers to avoid duplicates
      const messageExists = existingMessages.some(
        (existingMsg) => existingMsg.headers === message.headers,
      );
      
      if (messageExists) {
        this.logger.debug(`Message already exists in destination folder ${folderPath}`);
        return;
      }
      
      // Append message to destination folder
      await this.appendMessage(
        destConnection,
        folderPath,
        message.headers,
        message.attributes.flags,
        message.attributes.date,
      );
      
      this.logger.debug(`Message copied to destination folder ${folderPath}`);
    } catch (error) {
      this.logger.error(
        `Error copying message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Append a message to a folder
   * @param connection IMAP connection
   * @param path Folder path
   * @param content Message content
   * @param flags Message flags
   * @param date Message date
   */
  private appendMessage(
    connection: IMAP,
    path: string,
    content: string,
    flags: string[],
    date: Date,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.append(
        content,
        {
          mailbox: path,
          flags,
          date,
        },
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        },
      );
    });
  }

  /**
   * Get the sync status
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   * @returns Sync status
   */
  getSyncStatus(sourceConnectionId: string, destConnectionId: string): {
    inProgress: boolean;
    paused: boolean;
  } {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    return {
      inProgress: this.syncInProgress.get(syncKey) || false,
      paused: this.pausedSyncs.get(syncKey) || false,
    };
  }
}