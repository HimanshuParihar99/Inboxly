import { Injectable, Logger } from '@nestjs/common';
import { ImapConnectionService } from './imap-connection.service';
import { EmailMessage, ImapFolder, MessageFlags } from '../interfaces/imap-connection.interface';
import IMAP = require('imap');
import { simpleParser } from 'mailparser';
import { EventEmitter } from 'events';

/**
 * Service for synchronizing emails between IMAP servers
 */
@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);
  private readonly eventEmitter: EventEmitter = new EventEmitter();
  private syncTasks: Map<string, { paused: boolean; canceled: boolean }> = new Map();
  
  constructor(private readonly imapConnectionService: ImapConnectionService) {
    this.eventEmitter.setMaxListeners(100);
  }
  
  /**
   * Start synchronizing emails between source and destination IMAP servers
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   * @returns Sync task ID
   */
  async startSync(
    sourceConnectionId: string,
    destConnectionId: string,
  ): Promise<string> {
    const taskId = `${sourceConnectionId}-${destConnectionId}`;
    
    // Initialize sync task state
    this.syncTasks.set(taskId, { paused: false, canceled: false });
    
    // Start the sync process in the background
    this.syncProcess(taskId, sourceConnectionId, destConnectionId).catch((error) => {
      this.logger.error(`Sync task ${taskId} failed: ${error.message}`);
      this.eventEmitter.emit('sync:error', { taskId, error });
    });
    
    return taskId;
  }
  
  /**
   * Pause a sync task
   * @param taskId Sync task ID
   */
  pauseSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task) {
      task.paused = true;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} paused`);
      this.eventEmitter.emit('sync:paused', taskId);
    }
  }
  
  /**
   * Resume a paused sync task
   * @param taskId Sync task ID
   */
  resumeSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task && task.paused) {
      task.paused = false;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} resumed`);
      this.eventEmitter.emit('sync:resumed', taskId);
    }
  }
  
  /**
   * Cancel a sync task
   * @param taskId Sync task ID
   */
  cancelSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task) {
      task.canceled = true;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} canceled`);
      this.eventEmitter.emit('sync:canceled', taskId);
    }
  }
  
  /**
   * Get the status of all sync tasks
   * @returns Object with sync status information
   */
  getSyncStatus(): { activeSyncs: number; pausedSyncs: number; tasks: Array<{ taskId: string; paused: boolean; canceled: boolean }> } {
    const status = {
      activeSyncs: 0,
      pausedSyncs: 0,
      tasks: [] as Array<{ taskId: string; paused: boolean; canceled: boolean }>
    };
    
    this.syncTasks.forEach((task, taskId) => {
      if (task.paused) {
        status.pausedSyncs++;
      } else if (!task.canceled) {
        status.activeSyncs++;
      }
      
      status.tasks.push({
        taskId,
        paused: task.paused,
        canceled: task.canceled
      });
    });
    
    return status;
  }
  
  /**
   * Main sync process
   * @param taskId Sync task ID
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   */
  private async syncProcess(
    taskId: string,
    sourceConnectionId: string,
    destConnectionId: string,
  ): Promise<void> {
    try {
      // Get source folders
      const sourceFolders = await this.imapConnectionService.listFolders(sourceConnectionId)
        .catch(error => {
          this.logger.error(`Failed to list source folders: ${error.message}`);
          throw new Error(`Source connection error: ${error.message}`);
        });
      
      // Get destination folders
      const destFolders = await this.imapConnectionService.listFolders(destConnectionId)
        .catch(error => {
          this.logger.error(`Failed to list destination folders: ${error.message}`);
          throw new Error(`Destination connection error: ${error.message}`);
        });
      
      // Create missing folders in destination
      await this.createMissingFolders(destConnectionId, sourceFolders, destFolders)
        .catch(error => {
          this.logger.error(`Failed to create missing folders: ${error.message}`);
          throw new Error(`Folder creation error: ${error.message}`);
        });
      
      // Sync each folder
      let foldersProcessed = 0;
      const totalFolders = sourceFolders.length;
      
      for (const folder of sourceFolders) {
        // Check if task is canceled
        const task = this.syncTasks.get(taskId);
        if (!task || task.canceled) {
          this.logger.log(`Sync task ${taskId} was canceled, stopping sync process`);
          return;
        }
        
        // Wait if task is paused
        await this.waitIfPaused(taskId);
        
        try {
          // Sync folder
          await this.syncFolder(taskId, sourceConnectionId, destConnectionId, folder.path);
          foldersProcessed++;
          
          // Emit progress event
          const progress = Math.round((foldersProcessed / totalFolders) * 100);
          this.eventEmitter.emit('sync:progress', { taskId, progress, currentFolder: folder.path });
        } catch (folderError) {
          this.logger.error(`Error syncing folder ${folder.path}: ${folderError.message}`);
          this.eventEmitter.emit('sync:folder:error', { taskId, folderPath: folder.path, error: folderError.message });
          // Continue with next folder instead of stopping the entire sync
        }
      }
      
      this.logger.log(`Sync task ${taskId} completed successfully (${foldersProcessed}/${totalFolders} folders)`);
      this.eventEmitter.emit('sync:completed', { taskId, foldersProcessed, totalFolders });
    } catch (error) {
      this.logger.error(`Sync process error: ${error.message}`);
      this.eventEmitter.emit('sync:error', { taskId, error: error.message, timestamp: new Date() });
      throw error;
    }
  }
  
  /**
   * Wait if the sync task is paused
   * @param taskId Sync task ID
   */
  private async waitIfPaused(taskId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const checkPaused = () => {
        const task = this.syncTasks.get(taskId);
        if (!task || task.canceled) {
          resolve();
          return;
        }
        
        if (task.paused) {
          setTimeout(checkPaused, 1000); // Check again in 1 second
        } else {
          resolve();
        }
      };
      
      checkPaused();
    });
  }
  
  /**
   * Create missing folders in destination
   * @param destConnectionId Destination IMAP connection ID
   * @param sourceFolders Source folders
   * @param destFolders Destination folders
   */
  private async createMissingFolders(
    destConnectionId: string,
    sourceFolders: ImapFolder[],
    destFolders: ImapFolder[],
  ): Promise<void> {
    const destConnection = this.imapConnectionService.getConnection(destConnectionId);
    
    // Flatten folder hierarchies for easier comparison
    const sourcePathsSet = new Set(this.flattenFolders(sourceFolders).map(f => f.path));
    const destPathsSet = new Set(this.flattenFolders(destFolders).map(f => f.path));
    
    // Find missing folders
    const missingFolders = Array.from(sourcePathsSet)
      .filter(path => !destPathsSet.has(path))
      .sort((a, b) => a.split('/').length - b.split('/').length); // Sort by depth to create parent folders first
    
    // Create missing folders
    for (const folderPath of missingFolders) {
      await new Promise<void>((resolve, reject) => {
        destConnection.addBox(folderPath, (err) => {
          if (err) {
            this.logger.error(`Failed to create folder ${folderPath}: ${err.message}`);
            reject(err);
            return;
          }
          
          this.logger.log(`Created folder ${folderPath} in destination`);
          resolve();
        });
      });
    }
  }
  
  /**
   * Flatten folder hierarchy into a list
   * @param folders Folder hierarchy
   * @param result Result array
   * @returns Flattened folder list
   */
  private flattenFolders(folders: ImapFolder[], result: ImapFolder[] = []): ImapFolder[] {
    for (const folder of folders) {
      result.push(folder);
      if (folder.children && folder.children.length > 0) {
        this.flattenFolders(folder.children, result);
      }
    }
    return result;
  }
  
  /**
   * Synchronize a single folder
   * @param taskId Sync task ID
   * @param sourceConnectionId Source IMAP connection ID
   * @param destConnectionId Destination IMAP connection ID
   * @param folderPath Folder path
   */
  private async syncFolder(
    taskId: string,
    sourceConnectionId: string,
    destConnectionId: string,
    folderPath: string,
  ): Promise<void> {
    const sourceConnection = this.imapConnectionService.getConnection(sourceConnectionId);
    const destConnection = this.imapConnectionService.getConnection(destConnectionId);
    
    this.logger.log(`Syncing folder ${folderPath}`);
    this.eventEmitter.emit('sync:folder:start', { taskId, folderPath });
    
    // Open source mailbox
    await new Promise<void>((resolve, reject) => {
      sourceConnection.openBox(folderPath, false, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    
    // Get messages from source
    const messages = await this.fetchMessages(sourceConnection, '1:*');
    
    // Open destination mailbox
    await new Promise<void>((resolve, reject) => {
      destConnection.openBox(folderPath, false, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    
    // Copy messages to destination
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Check if task is canceled
      const task = this.syncTasks.get(taskId);
      if (!task || task.canceled) {
        this.logger.log(`Sync task ${taskId} was canceled, stopping folder sync`);
        return;
      }
      
      // Wait if task is paused
      await this.waitIfPaused(taskId);
      
      // Append message to destination
      await this.appendMessage(destConnection, folderPath, message);
      
      // Update progress
      const progress = Math.round(((i + 1) / messages.length) * 100);
      this.eventEmitter.emit('sync:folder:progress', { taskId, folderPath, progress });
    }
    
    this.logger.log(`Completed syncing folder ${folderPath}`);
    this.eventEmitter.emit('sync:folder:complete', { taskId, folderPath });
  }
  
  /**
   * Fetch messages from an IMAP connection
   * @param connection IMAP connection
   * @param range Message range
   * @returns Array of email messages
   */
  private async fetchMessages(connection: IMAP, range: string): Promise<EmailMessage[]> {
    return new Promise<EmailMessage[]>((resolve, reject) => {
      const messages: EmailMessage[] = [];
      
      // Use type assertion for the entire options object to avoid FetchOptions type error
      const fetchOptions = {
        bodies: '',
        struct: true,
        envelope: true,
        size: true,
        flags: true
      } as any;
      
      const fetch = connection.fetch(range, fetchOptions);
      
      fetch.on('message', (msg, seqno) => {
        const message: Partial<EmailMessage> = {
          uid: 0,
          flags: {},
          headers: {},
          size: 0,
          date: new Date(),
          subject: '',
          from: [],
          to: [],
          messageId: '',
        };
        
        msg.on('body', (stream, info) => {
          let buffer = '';
          
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          
          stream.once('end', async () => {
            // Parse email using mailparser
            const parsed = await simpleParser(buffer);
            
            message.subject = parsed.subject || '';
            message.date = parsed.date || new Date();
            message.html = parsed.html || undefined;
            message.text = parsed.text || undefined;
            // Type assertion for attachments to match EmailMessage interface
            message.attachments = parsed.attachments as any;
            message.messageId = parsed.messageId || '';
            message.inReplyTo = parsed.inReplyTo || undefined;
            // Type assertion for references to match EmailMessage interface
            message.references = Array.isArray(parsed.references) ? parsed.references : 
              (parsed.references ? [parsed.references] : undefined) as string[] | undefined;
            
            // Parse from, to, cc, bcc
            if (parsed.from && parsed.from.value) {
              message.from = parsed.from.value.map(addr => ({
                name: addr.name || '',
                address: addr.address || '',
              }));
            }
            
            // Handle email addresses with type safety
            if (parsed.to) {
              // Convert to array of simple address objects
              message.to = [];
              try {
                // Handle different possible formats from mailparser
                const toAddresses = Array.isArray(parsed.to) ? parsed.to : 
                  (parsed.to as any).value || [];
                
                if (Array.isArray(toAddresses)) {
                  message.to = toAddresses.map((addr: any) => ({
                    name: (addr.name as string) || '',
                    address: (addr.address as string) || '',
                  }));
                }
              } catch (e) {
                this.logger.warn(`Error parsing 'to' addresses: ${e.message}`);
              }
            }
            
            if (parsed.cc) {
              // Convert to array of simple address objects
              message.cc = [];
              try {
                // Handle different possible formats from mailparser
                const ccAddresses = Array.isArray(parsed.cc) ? parsed.cc : 
                  (parsed.cc as any).value || [];
                
                if (Array.isArray(ccAddresses)) {
                  message.cc = ccAddresses.map((addr: any) => ({
                    name: (addr.name as string) || '',
                    address: (addr.address as string) || '',
                  }));
                }
              } catch (e) {
                this.logger.warn(`Error parsing 'cc' addresses: ${e.message}`);
              }
            }
            
            if (parsed.bcc) {
              // Convert to array of simple address objects
              message.bcc = [];
              try {
                // Handle different possible formats from mailparser
                const bccAddresses = Array.isArray(parsed.bcc) ? parsed.bcc : 
                  (parsed.bcc as any).value || [];
                
                if (Array.isArray(bccAddresses)) {
                  message.bcc = bccAddresses.map((addr: any) => ({
                    name: (addr.name as string) || '',
                    address: (addr.address as string) || '',
                  }));
                }
              } catch (e) {
                this.logger.warn(`Error parsing 'bcc' addresses: ${e.message}`);
              }
            }
            
            // Store headers
            message.headers = {};
            // Check if headers exist and get all headers
            if (parsed.headers) {
              try {
                // Use type assertion to handle the headers object
                const headers = (parsed.headers as any).headerLines || {};
                for (const [key, value] of Object.entries(headers)) {
                  if (typeof value === 'string') {
                    message.headers[key] = value;
                  } else if (Array.isArray(value)) {
                    message.headers[key] = value.join(', ');
                  }
                }
              } catch (e) {
                this.logger.warn(`Error parsing headers: ${e.message}`);
              }
            }
            
            // Store raw source
            message.source = Buffer.from(buffer);
          });
        });
        
        msg.once('attributes', (attrs) => {
          message.uid = attrs.uid;
          message.size = attrs.size;
          
          // Parse flags
          message.flags = {
            seen: attrs.flags.includes('\\Seen'),
            answered: attrs.flags.includes('\\Answered'),
            flagged: attrs.flags.includes('\\Flagged'),
            deleted: attrs.flags.includes('\\Deleted'),
            draft: attrs.flags.includes('\\Draft'),
            recent: attrs.flags.includes('\\Recent'),
          };
        });
        
        msg.once('end', () => {
          messages.push(message as EmailMessage);
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
   * Append a message to an IMAP mailbox
   * @param connection IMAP connection
   * @param mailboxName Mailbox name
   * @param message Email message
   */
  private async appendMessage(
    connection: IMAP,
    mailboxName: string,
    message: EmailMessage,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!message.source) {
        reject(new Error('Message source is missing'));
        return;
      }
      
      // Convert flags to IMAP format
      const flags: string[] = [];
      if (message.flags.seen) flags.push('\\Seen');
      if (message.flags.answered) flags.push('\\Answered');
      if (message.flags.flagged) flags.push('\\Flagged');
      if (message.flags.deleted) flags.push('\\Deleted');
      if (message.flags.draft) flags.push('\\Draft');
      
      connection.append(message.source, {
        mailbox: mailboxName,
        flags: flags,
        date: message.date,
      }, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}