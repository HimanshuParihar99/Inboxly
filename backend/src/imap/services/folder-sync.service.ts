import { Injectable, Logger } from '@nestjs/common';
import { ImapConnectionService } from './imap-connection.service';
import { ImapFolder } from '../interfaces/imap-connection.interface';
import IMAP from 'imap';

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);
  private syncInProgress = new Map<string, boolean>();
  private pausedSyncs = new Map<string, boolean>();

  constructor(private readonly imapConnectionService: ImapConnectionService) {}

  /** Main entry: sync all folders between two connections */
  async syncFolders(sourceConnectionId: string, destConnectionId: string): Promise<void> {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;

    if (this.syncInProgress.get(syncKey)) {
      this.logger.log(`Sync already in progress for ${syncKey}`);
      return;
    }

    if (this.pausedSyncs.get(syncKey)) {
      this.logger.log(`Sync is paused for ${syncKey}`);
      return;
    }

    this.syncInProgress.set(syncKey, true);

    try {
      const sourceConnection: IMAP = await this.imapConnectionService.getConnection(sourceConnectionId);
      const destConnection: IMAP = await this.imapConnectionService.getConnection(destConnectionId);

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

  /** ---------------- Private Helpers ---------------- */

  private getFolders(connection: IMAP): Promise<ImapFolder[]> {
    return new Promise((resolve, reject) => {
      connection.getBoxes((err, boxes) => {
        if (err) return reject(err);

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
      if (!Object.prototype.hasOwnProperty.call(boxes, name)) continue;

      const box = boxes[name];
      const path = parentPath ? `${parentPath}${delimiter}${name}` : name;

      folders.push({
        name: this.sanitizeFolderName(name),
        path,
        delimiter,
        attribs: Array.isArray(box.attribs) ? [...box.attribs] : [],
        children: [],
      });

      if (box.children) {
        this.parseFolderHierarchy(box.children, path, folders, delimiter);
      }
    }
  }

  private sanitizeFolderName(name: string): string {
    return name.replace(/[\/\\*?"<>|]/g, (c) => {
      switch (c) {
        case '/':
        case '\\':
          return '-';
        case '*':
        case '?':
        case '|':
          return '_';
        case '"':
          return "'";
        case '<':
          return '(';
        case '>':
          return ')';
        default:
          return c;
      }
    });
  }

  private async createMissingFolders(
    destConnection: IMAP,
    sourceFolders: ImapFolder[],
    destFolders: ImapFolder[],
  ): Promise<void> {
    const destFolderPaths = destFolders.map((f) => f.path);
    const sortedSourceFolders = [...sourceFolders].sort((a, b) => a.path.length - b.path.length);

    for (const folder of sortedSourceFolders) {
      if (!destFolderPaths.includes(folder.path)) {
        try {
          await this.createFolder(destConnection, folder.path);
          this.logger.log(`Created folder: ${folder.path}`);
        } catch (error: any) {
          this.logger.error(`Error creating folder ${folder.path}: ${error.message}`, error.stack);
        }
      }
    }
  }

  private createFolder(connection: IMAP, path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.addBox(path, (err) => (err ? reject(err) : resolve()));
    });
  }

  private async syncFolderMessages(
    sourceConnection: IMAP,
    destConnection: IMAP,
    folderPath: string,
  ): Promise<void> {
    try {
      const sourceBox = await this.openFolder(sourceConnection, folderPath);
      await this.openFolder(destConnection, folderPath);

      if (sourceBox.messages.total === 0) return;

      const messages = await this.fetchMessages(sourceConnection, '1:*', {
        bodies: 'HEADER',
        struct: true,
      });

      for (const message of messages) {
        await this.copyMessageWithFlags(destConnection, message, folderPath);
      }
    } catch (error: any) {
      this.logger.error(`Error syncing folder ${folderPath}: ${error.message}`, error.stack);
      throw error;
    }
  }

  private openFolder(connection: IMAP, path: string, readOnly = false): Promise<IMAP.Box> {
    return new Promise((resolve, reject) => {
      connection.openBox(path, readOnly, (err, box) => (err ? reject(err) : resolve(box)));
    });
  }

  private fetchMessages(connection: IMAP, source: string, options: IMAP.FetchOptions): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const messages: any[] = [];
      const fetch = connection.fetch(source, options);

      fetch.on('message', (msg, seqno) => {
        const message: any = { seqno, attributes: null, headers: null };

        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => (buffer += chunk.toString('utf8')));
          stream.on('end', () => {
            if (info.which === 'HEADER') message.headers = buffer;
          });
        });

        msg.once('attributes', (attrs) => (message.attributes = attrs));
        msg.once('end', () => messages.push(message));
      });

      fetch.once('error', (err) => reject(err));
      fetch.once('end', () => resolve(messages));
    });
  }

  private async copyMessageWithFlags(
    destConnection: IMAP,
    message: any,
    folderPath: string,
  ): Promise<void> {
    try {
      const existingMessages = await this.fetchMessages(destConnection, '1:*', { bodies: 'HEADER' });

      const exists = existingMessages.some((msg) => msg.headers === message.headers);
      if (exists) {
        this.logger.debug(`Message already exists in destination folder ${folderPath}`);
        return;
      }

      await this.appendMessage(
        destConnection,
        folderPath,
        message.headers,
        message.attributes?.flags || [],
        message.attributes?.date || new Date(),
      );
      this.logger.debug(`Message copied to destination folder ${folderPath}`);
    } catch (error: any) {
      this.logger.error(`Error copying message: ${error.message}`, error.stack);
      throw error;
    }
  }

  private appendMessage(
    connection: IMAP,
    path: string,
    content: string,
    flags: string[],
    date: Date,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      connection.append(content, { mailbox: path, flags, date }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  /** Public status accessor */
  getSyncStatus(sourceConnectionId: string, destConnectionId: string): { inProgress: boolean; paused: boolean } {
    const syncKey = `${sourceConnectionId}-${destConnectionId}`;
    return {
      inProgress: this.syncInProgress.get(syncKey) || false,
      paused: this.pausedSyncs.get(syncKey) || false,
    };
  }
}
