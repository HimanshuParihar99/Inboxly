import { Injectable, Logger } from '@nestjs/common';
import { ImapConnectionService } from './imap-connection.service';
import { EmailMessage, ImapFolder } from '../interfaces/imap-connection.interface';
import IMAP from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { EventEmitter } from 'events';

@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);
  private readonly eventEmitter: EventEmitter = new EventEmitter();
  private syncTasks: Map<string, { paused: boolean; canceled: boolean }> = new Map();

  constructor(private readonly imapConnectionService: ImapConnectionService) {
    this.eventEmitter.setMaxListeners(100);
  }

  async startSync(sourceConnectionId: string, destConnectionId: string): Promise<string> {
    const taskId = `${sourceConnectionId}-${destConnectionId}`;
    this.syncTasks.set(taskId, { paused: false, canceled: false });

    this.syncProcess(taskId, sourceConnectionId, destConnectionId).catch((error) => {
      this.logger.error(`Sync task ${taskId} failed: ${error.message}`);
      this.eventEmitter.emit('sync:error', { taskId, error });
    });

    return taskId;
  }

  pauseSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task) {
      task.paused = true;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} paused`);
      this.eventEmitter.emit('sync:paused', taskId);
    }
  }

  resumeSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task && task.paused) {
      task.paused = false;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} resumed`);
      this.eventEmitter.emit('sync:resumed', taskId);
    }
  }

  cancelSync(taskId: string): void {
    const task = this.syncTasks.get(taskId);
    if (task) {
      task.canceled = true;
      this.syncTasks.set(taskId, task);
      this.logger.log(`Sync task ${taskId} canceled`);
      this.eventEmitter.emit('sync:canceled', taskId);
    }
  }

  getSyncStatus() {
    const status = {
      activeSyncs: 0,
      pausedSyncs: 0,
      tasks: [] as Array<{ taskId: string; paused: boolean; canceled: boolean }>,
    };

    this.syncTasks.forEach((task, taskId) => {
      if (task.paused) status.pausedSyncs++;
      else if (!task.canceled) status.activeSyncs++;

      status.tasks.push({ taskId, paused: task.paused, canceled: task.canceled });
    });

    return status;
  }

  private async syncProcess(taskId: string, sourceConnectionId: string, destConnectionId: string): Promise<void> {
    try {
      const sourceFolders = await this.imapConnectionService.listFolders(sourceConnectionId);
      const destFolders = await this.imapConnectionService.listFolders(destConnectionId);

      await this.createMissingFolders(destConnectionId, sourceFolders, destFolders);

      let foldersProcessed = 0;
      const totalFolders = sourceFolders.length;

      for (const folder of sourceFolders) {
        const task = this.syncTasks.get(taskId);
        if (!task || task.canceled) return;

        await this.waitIfPaused(taskId);

        try {
          await this.syncFolder(taskId, sourceConnectionId, destConnectionId, folder.path);
          foldersProcessed++;
          const progress = Math.round((foldersProcessed / totalFolders) * 100);
          this.eventEmitter.emit('sync:progress', { taskId, progress, currentFolder: folder.path });
        } catch (err) {
          this.logger.error(`Error syncing folder ${folder.path}: ${err.message}`);
          this.eventEmitter.emit('sync:folder:error', { taskId, folderPath: folder.path, error: err.message });
        }
      }

      this.logger.log(`Sync task ${taskId} completed successfully`);
      this.eventEmitter.emit('sync:completed', { taskId, foldersProcessed, totalFolders });
    } catch (error) {
      this.logger.error(`Sync process error: ${error.message}`);
      this.eventEmitter.emit('sync:error', { taskId, error: error.message });
      throw error;
    }
  }

  private async waitIfPaused(taskId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const task = this.syncTasks.get(taskId);
        if (!task || task.canceled) return resolve();
        if (task.paused) setTimeout(check, 1000);
        else resolve();
      };
      check();
    });
  }

  private async createMissingFolders(destConnectionId: string, sourceFolders: ImapFolder[], destFolders: ImapFolder[]) {
    const destConnection = this.imapConnectionService.getConnection(destConnectionId);

    const sourcePaths = new Set(this.flattenFolders(sourceFolders).map((f) => f.path));
    const destPaths = new Set(this.flattenFolders(destFolders).map((f) => f.path));

    const missing = Array.from(sourcePaths).filter((p) => !destPaths.has(p));

    for (const folderPath of missing) {
      await new Promise<void>((resolve, reject) => {
        destConnection.addBox(folderPath, (err) => {
          if (err) return reject(err);
          this.logger.log(`Created folder ${folderPath} in destination`);
          resolve();
        });
      });
    }
  }

  private flattenFolders(folders: ImapFolder[], result: ImapFolder[] = []): ImapFolder[] {
    for (const f of folders) {
      result.push(f);
      if (f.children?.length) this.flattenFolders(f.children, result);
    }
    return result;
  }

  private async syncFolder(taskId: string, sourceConnectionId: string, destConnectionId: string, folderPath: string) {
    const sourceConn = this.imapConnectionService.getConnection(sourceConnectionId);
    const destConn = this.imapConnectionService.getConnection(destConnectionId);

    this.logger.log(`Syncing folder ${folderPath}`);
    this.eventEmitter.emit('sync:folder:start', { taskId, folderPath });

    await new Promise<void>((res, rej) => sourceConn.openBox(folderPath, false, (err) => (err ? rej(err) : res())));
    const messages = await this.fetchMessages(sourceConn, '1:*');

    await new Promise<void>((res, rej) => destConn.openBox(folderPath, false, (err) => (err ? rej(err) : res())));

    for (let i = 0; i < messages.length; i++) {
      const task = this.syncTasks.get(taskId);
      if (!task || task.canceled) return;
      await this.waitIfPaused(taskId);

      await this.appendMessage(destConn, folderPath, messages[i]);
      const progress = Math.round(((i + 1) / messages.length) * 100);
      this.eventEmitter.emit('sync:folder:progress', { taskId, folderPath, progress });
    }

    this.logger.log(`Completed syncing folder ${folderPath}`);
    this.eventEmitter.emit('sync:folder:complete', { taskId, folderPath });
  }

  private async fetchMessages(connection: IMAP, range: string): Promise<EmailMessage[]> {
    return new Promise((resolve, reject) => {
      const msgs: EmailMessage[] = [];
      const fetch = connection.fetch(range, { bodies: '', struct: true } as any);

      fetch.on('message', (msg) => {
        const email: Partial<EmailMessage> = { uid: 0, flags: {}, headers: {}, size: 0, date: new Date(), from: [], to: [] };
        let raw = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => (raw += chunk.toString('utf8')));
          stream.once('end', async () => {
            try {
              const parsed: ParsedMail = await simpleParser(raw);
              email.subject = parsed.subject || '';
              email.date = parsed.date || new Date();
              email.text = parsed.text || undefined;
              email.html = parsed.html || undefined;
              email.attachments = parsed.attachments as any;
              email.messageId = parsed.messageId || '';
              email.inReplyTo = parsed.inReplyTo || undefined;
              email.references = parsed.references || undefined;

              if (parsed.from?.value) email.from = parsed.from.value.map((a) => ({ name: a.name || '', address: a.address || '' }));
              if (parsed.to?.value) email.to = parsed.to.value.map((a) => ({ name: a.name || '', address: a.address || '' }));
              if (parsed.cc?.value) email.cc = parsed.cc.value.map((a) => ({ name: a.name || '', address: a.address || '' }));
              if (parsed.bcc?.value) email.bcc = parsed.bcc.value.map((a) => ({ name: a.name || '', address: a.address || '' }));

              parsed.headers.forEach((val, key) => {
                email.headers![key] = Array.isArray(val) ? val.join(', ') : String(val);
              });

              email.source = Buffer.from(raw);
            } catch (e) {
              this.logger.warn(`Failed to parse message: ${e.message}`);
            }
          });
        });

        msg.once('attributes', (attrs: any) => {
          email.uid = attrs.uid;
          email.size = attrs.size;
          email.flags = {
            seen: attrs.flags.includes('\\Seen'),
            answered: attrs.flags.includes('\\Answered'),
            flagged: attrs.flags.includes('\\Flagged'),
            deleted: attrs.flags.includes('\\Deleted'),
            draft: attrs.flags.includes('\\Draft'),
            recent: attrs.flags.includes('\\Recent'),
          };
        });

        msg.once('end', () => msgs.push(email as EmailMessage));
      });

      fetch.once('error', reject);
      fetch.once('end', () => resolve(msgs));
    });
  }

  private async appendMessage(connection: IMAP, mailbox: string, msg: EmailMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!msg.source) return reject(new Error('Message source missing'));
      const flags: string[] = [];
      if (msg.flags.seen) flags.push('\\Seen');
      if (msg.flags.answered) flags.push('\\Answered');
      if (msg.flags.flagged) flags.push('\\Flagged');
      if (msg.flags.deleted) flags.push('\\Deleted');
      if (msg.flags.draft) flags.push('\\Draft');

      connection.append(msg.source, { mailbox, flags, date: msg.date }, (err) => (err ? reject(err) : resolve()));
    });
  }
}