import { Injectable, Logger } from '@nestjs/common';
import { ImapConnectionService } from './imap-connection.service';
import { ImapFolder } from '../interfaces/imap-connection.interface';
import * as IMAP from 'imap';

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);
  private syncInProgress = new Map<string, boolean>();
  private pausedSyncs = new Map<string, boolean>();

  constructor(private readonly imapConnectionService: ImapConnectionService) {}

  async syncFolders(
    sourceConnectionId: string,
    destConnectionId: string,
  ): Promise<void> {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;

    if (this.syncInProgress.get(syncKey)) {
      this.logger.log(`Sync already in progress for ${syncKey}`);
      return;
    }

    if (this.pausedSyncs.get(syncKey)) {
      this.logger.log(`Sync is paused for ${syncKey}`);
      return;
    }

    try {
      this.syncInProgress.set(syncKey, true);

      // ✅ Awaited connections are IMAP.Connection
      const sourceConnection: IMAP.Connection =
        await this.imapConnectionService.getConnection(sourceConnectionId);
      const destConnection: IMAP.Connection =
        await this.imapConnectionService.getConnection(destConnectionId);

      const sourceFolders = await this.getFolders(sourceConnection);
      const destFolders = await this.getFolders(destConnection);

      await this.createMissingFolders(destConnection, sourceFolders, destFolders);

      for (const folder of sourceFolders) {
        if (this.pausedSyncs.get(syncKey)) {
          this.logger.log(`Sync paused during operation for ${syncKey}`);
          break;
        }

        await this.syncFolderMessages(sourceConnection, destConnection, folder.path);
      }

      this.logger.log(`Folder sync completed for ${syncKey}`);
    } catch (error: any) {
      this.logger.error(`Error syncing folders: ${error.message}`, error.stack);
      throw error;
    } finally {
      this.syncInProgress.set(syncKey, false);
    }
  }

  pauseSync(sourceConnectionId: string, destConnectionId: string): void {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    this.pausedSyncs.set(syncKey, true);
    this.logger.log(`Sync paused for ${syncKey}`);
  }

  resumeSync(sourceConnectionId: string, destConnectionId: string): void {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    this.pausedSyncs.set(syncKey, false);
    this.logger.log(`Sync resumed for ${syncKey}`);

    if (!this.syncInProgress.get(syncKey)) {
      this.syncFolders(sourceConnectionId, destConnectionId);
    }
  }

  private getFolders(connection: IMAP.Connection): Promise<ImapFolder[]> {
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

        const sanitizedName = this.sanitizeFolderName(name);

        folders.push({
          name: sanitizedName,
          path,
          delimiter,
          attribs: box.attribs,
          children: [],
        });

        if (box.children) {
          this.parseFolderHierarchy(box.children, path, folders, delimiter);
        }
      }
    }
  }

  private sanitizeFolderName(name: string): string {
    return name
      .replace(/\//g, '-')
      .replace(/\\/g, '-')
      .replace(/\*/g, '_')
      .replace(/\?/g, '_')
      .replace(/"/g, "'")
      .replace(/</g, '(')
      .replace(/>/g, ')')
      .replace(/\|/g, '_');
  }

  private async createMissingFolders(
    destConnection: IMAP.Connection,
    sourceFolders: ImapFolder[],
    destFolders: ImapFolder[],
  ): Promise<void> {
    const destFolderPaths = destFolders.map((folder) => folder.path);
    const sortedSourceFolders = [...sourceFolders].sort(
      (a, b) => a.path.length - b.path.length,
    );

    for (const folder of sortedSourceFolders) {
      if (!destFolderPaths.includes(folder.path)) {
        try {
          await this.createFolder(destConnection, folder.path);
          this.logger.log(`Created folder: ${folder.path}`);
        } catch (error: any) {
          this.logger.error(
            `Error creating folder ${folder.path}: ${error.message}`,
            error.stack,
          );
        }
      }
    }
  }

  private createFolder(connection: IMAP.Connection, path: string): Promise<void> {
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

  private async syncFolderMessages(
    sourceConnection: IMAP.Connection,
    destConnection: IMAP.Connection,
    folderPath: string,
  ): Promise<void> {
    try {
      const sourceBox = await this.openFolder(sourceConnection, folderPath);
      await this.openFolder(destConnection, folderPath);

      if (sourceBox.messages.total === 0) {
        return;
      }

      const messages = await this.fetchMessages(sourceConnection, '1:*', {
        bodies: 'HEADER',
        envelope: true,
        flags: true,
        date: true,
      });

      for (const message of messages) {
        await this.copyMessageWithFlags(sourceConnection, destConnection, message, folderPath);
      }
    } catch (error: any) {
      this.logger.error(
        `Error syncing folder ${folderPath}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private openFolder(
    connection: IMAP.Connection,
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

  private fetchMessages(
    connection: IMAP.Connection,
    source: string,
    options: IMAP.FetchOptions,
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const fetch = connection.fetch(source, options);

      fetch.on('message', (msg, seqno) => {
        const message: any = { seqno, attributes: null, headers: null };

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

      fetch.once('error', (err) => reject(err));
      fetch.once('end', () => resolve(messages));
    });
  }

  private async copyMessageWithFlags(
    sourceConnection: IMAP.Connection,
    destConnection: IMAP.Connection,
    message: any,
    folderPath: string,
  ): Promise<void> {
    try {
      const existingMessages = await this.fetchMessages(destConnection, '1:*', {
        bodies: 'HEADER',
      });

      const messageExists = existingMessages.some(
        (existingMsg) => existingMsg.headers === message.headers,
      );

      if (messageExists) {
        this.logger.debug(`Message already exists in destination folder ${folderPath}`);
        return;
      }

      await this.appendMessage(
        destConnection,
        folderPath,
        message.headers,
        message.attributes.flags,
        message.attributes.date,
      );

      this.logger.debug(`Message copied to destination folder ${folderPath}`);
    } catch (error: any) {
      this.logger.error(`Error copying message: ${error.message}`, error.stack);
      throw error;
    }
  }

  private appendMessage(
    connection: IMAP.Connection,
    path: string,
    content: string,
    flags: string[],
    date: Date,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.append(
        content,
        { mailbox: path, flags, date },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

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
