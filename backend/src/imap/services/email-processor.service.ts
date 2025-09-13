import { Injectable, Logger } from '@nestjs/common';
import { EmailAnalytics, EmailMessage } from '../interfaces/imap-connection.interface';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import { promisify } from 'util';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailIndex, EmailIndexDocument } from '../schemas/email-index.schema';

/**
 * Service for processing and analyzing emails
 */
@Injectable()
export class EmailProcessorService {
  private readonly logger = new Logger(EmailProcessorService.name);

  // Promisify DNS functions
  private readonly dnsResolve = promisify(dns.resolve);
  private readonly dnsResolveMx = promisify(dns.resolveMx);
  private readonly dnsTxt = promisify(dns.resolveTxt);

  constructor(
    @InjectModel(EmailIndex.name)
    private readonly emailIndexModel: Model<EmailIndexDocument>,
    @InjectModel('EmailAnalytics')
    private readonly emailAnalyticsModel: Model<EmailAnalytics>,
  ) {}

  /**
   * Index an email for full-text search
   */
  private async indexEmailForSearch(
    message: EmailMessage,
    userId: string,
    connectionId?: string,
    folderPath?: string,
  ): Promise<void> {
    try {
      if (!message?.messageId) {
        this.logger.warn('Skipping indexing: messageId missing');
        return;
      }

      const existingIndex = await this.emailIndexModel
        .findOne({ messageId: message.messageId, userId })
        .exec();

      if (existingIndex) {
        this.logger.debug(`Email ${message.messageId} already indexed`);
        return;
      }

      const recipients = message.to?.map((to) => to.address) || [];
      const cc = message.cc?.map((cc) => cc.address) || [];
      const bcc = message.bcc?.map((bcc) => bcc.address) || [];
      const attachments = message.attachments?.map((a) => a.filename) || [];

      const emailIndex = new this.emailIndexModel({
        messageId: message.messageId,
        subject: message.subject ?? '',
        sender: message.from?.[0]?.address ?? '',
        senderDomain: this.extractDomain(message.from?.[0]?.address ?? ''),
        recipients,
        cc,
        bcc,
        textContent: message.text ?? '',
        htmlContent: message.html ?? '',
        attachments,
        date: message.date ?? new Date(),
        folderPath,
        userId,
        connectionId,
        tags: [],
      });

      await emailIndex.save();
      this.logger.debug(`Indexed email: ${message.subject ?? '(no subject)'}`);
    } catch (error: any) {
      this.logger.error(`Error indexing email: ${error.message}`, error.stack);
    }
  }

  /**
   * Search emails using full-text search
   */
  async searchEmails(
    userId: string,
    query: string,
    options?: {
      limit?: number;
      skip?: number;
      folderPath?: string;
      startDate?: Date;
      endDate?: Date;
      sender?: string;
      hasAttachments?: boolean;
      tags?: string[];
    },
  ): Promise<{ results: EmailIndex[]; total: number }> {
    try {
      const limit = options?.limit ?? 20;
      const skip = options?.skip ?? 0;
      const filter: Record<string, any> = { userId };

      if (query?.trim()) {
        filter.$text = { $search: query };
      }
      if (options?.folderPath) {
        filter.folderPath = options.folderPath;
      }
      if (options?.startDate || options?.endDate) {
        filter.date = {};
        if (options.startDate) filter.date.$gte = options.startDate;
        if (options.endDate) filter.date.$lte = options.endDate;
      }
      if (options?.sender) {
        filter.sender = { $regex: options.sender, $options: 'i' };
      }
      if (options?.hasAttachments) {
        filter.attachments = { $exists: true, $ne: [] };
      }
      if (options?.tags?.length) {
        filter.tags = { $all: options.tags };
      }

      const [results, total] = await Promise.all([
        this.emailIndexModel
          .find(filter)
          .sort(query?.trim() ? { score: { $meta: 'textScore' } } : { date: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.emailIndexModel.countDocuments(filter).exec(),
      ]);

      return { results, total };
    } catch (error: any) {
      this.logger.error(`Error searching emails: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Process an email message and generate analytics
   */
  async processEmail(
    message: EmailMessage,
    userId?: string,
    connectionId?: string,
    folderPath?: string,
  ): Promise<EmailAnalytics> {
    try {
      const sender = message.from?.[0]?.address ?? '';
      const senderDomain = this.extractDomain(sender);

      const timeDelta = this.calculateTimeDelta(message);
      const esp = await this.detectESP(message, senderDomain);
      const openRelay = await this.checkOpenRelay(senderDomain);
      const { tlsSupport, validCertificate } = await this.checkTlsSupport(senderDomain);

      if (userId) {
        await this.indexEmailForSearch(message, userId, connectionId, folderPath);
      }

      const analytics: EmailAnalytics = {
        messageId: message.messageId,
        sender,
        senderDomain,
        esp,
        timeDelta,
        openRelay,
        tlsSupport,
        validCertificate,
        userId,
        connectionId,
      };

      if (userId) {
        await this.emailAnalyticsModel.create(analytics);
      }

      return analytics;
    } catch (error: any) {
      this.logger.error(`Error processing email: ${error.message}`, error.stack);
      return {
        sender: message.from?.[0]?.address ?? '',
        senderDomain: this.extractDomain(message.from?.[0]?.address ?? ''),
      };
    }
  }

  /**
   * Extract domain from an email address
   */
  private extractDomain(email: string): string {
    const match = email?.match(/@([^@]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Calculate time delta between sent and received
   */
  private calculateTimeDelta(message: EmailMessage): number | undefined {
    try {
      const receivedHeader = message.headers?.['received'];
      if (!receivedHeader) return undefined;

      const receivedDateMatch = receivedHeader.match(/;\s*(.+)$/);
      if (!receivedDateMatch) return undefined;

      const receivedDate = new Date(receivedDateMatch[1]);
      const sentDate = message.date;
      return receivedDate.getTime() - (sentDate?.getTime?.() ?? 0);
    } catch (error: any) {
      this.logger.error(`Error calculating time delta: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Detect the Email Service Provider (ESP)
   */
  private async detectESP(message: EmailMessage, domain: string): Promise<string | undefined> {
    try {
      const headers: Record<string, string> = message.headers ?? {};

      const espPatterns: Record<string, string> = {
        'X-Mailgun-': 'Mailgun',
        'X-Mandrill-': 'Mandrill',
        'X-MC-': 'Mailchimp',
        'X-Sendgrid-': 'SendGrid',
        'X-SES-': 'Amazon SES',
        'X-Postmark-': 'Postmark',
        'X-Mailer: PHPMailer': 'PHPMailer',
        'X-Mailer: Microsoft Outlook': 'Microsoft Outlook',
        'X-Mailer: Apple Mail': 'Apple Mail',
        'X-Mailer: Gmail': 'Gmail',
        'X-Yahoo-Newman-': 'Yahoo Mail',
        'X-Proofpoint-': 'Proofpoint',
        'X-Forefront-': 'Microsoft Exchange Online',
        'X-MS-Exchange-': 'Microsoft Exchange',
        'X-Google-Smtp-Source': 'Gmail',
        'X-Gm-Message-State': 'Gmail',
      };

      for (const [pattern, espName] of Object.entries(espPatterns)) {
        for (const [headerName, headerValue] of Object.entries(headers)) {
          if (headerName.includes(pattern) || headerValue?.includes(pattern)) {
            return espName;
          }
        }
      }

      const dkimHeader = headers['dkim-signature'];
      if (dkimHeader) {
        if (dkimHeader.includes('d=mailchimp.com')) return 'Mailchimp';
        if (dkimHeader.includes('d=sendgrid.com')) return 'SendGrid';
        if (dkimHeader.includes('d=amazonses.com')) return 'Amazon SES';
        if (dkimHeader.includes('d=mailgun.org')) return 'Mailgun';
        if (dkimHeader.includes('d=postmarkapp.com')) return 'Postmark';
        if (dkimHeader.includes('d=gmail.com')) return 'Gmail';
        if (dkimHeader.includes('d=yahoo.com')) return 'Yahoo Mail';
        if (dkimHeader.includes('d=outlook.com')) return 'Microsoft Outlook';
      }

      const returnPath = headers['return-path'];
      if (returnPath) {
        if (returnPath.includes('amazonses.com')) return 'Amazon SES';
        if (returnPath.includes('sendgrid.net')) return 'SendGrid';
        if (returnPath.includes('mailgun.org')) return 'Mailgun';
        if (returnPath.includes('mailchimp.com')) return 'Mailchimp';
        if (returnPath.includes('postmarkapp.com')) return 'Postmark';
      }

      try {
        const txtRecords = await this.dnsTxt(domain);
        for (const record of txtRecords) {
          const spfRecord = record.join('').toLowerCase();
          if (spfRecord.startsWith('v=spf1')) {
            if (spfRecord.includes('include:amazonses.com')) return 'Amazon SES';
            if (spfRecord.includes('include:sendgrid.net')) return 'SendGrid';
            if (spfRecord.includes('include:mailgun.org')) return 'Mailgun';
            if (spfRecord.includes('include:spf.mandrillapp.com')) return 'Mandrill';
            if (spfRecord.includes('include:servers.mcsv.net')) return 'Mailchimp';
            if (spfRecord.includes('include:spf.protection.outlook.com')) return 'Microsoft Exchange Online';
          }
        }
      } catch {
        // ignore DNS errors
      }

      return undefined;
    } catch (error: any) {
      this.logger.error(`Error detecting ESP: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Check if a mail server is an open relay
   */
  private async checkOpenRelay(domain: string): Promise<boolean | undefined> {
    try {
      const mxRecords = await this.dnsResolveMx(domain);
      if (!mxRecords?.length) return undefined;

      mxRecords.sort((a, b) => a.priority - b.priority);
      const primaryMx = mxRecords[0].exchange;

      return await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 5000);

        socket.connect(25, primaryMx, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(false);
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    } catch (error: any) {
      this.logger.error(`Error checking open relay: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Check if a mail server supports TLS and has a valid certificate
   */
  private async checkTlsSupport(
    domain: string,
  ): Promise<{ tlsSupport: boolean | undefined; validCertificate: boolean | undefined }> {
    try {
      const mxRecords = await this.dnsResolveMx(domain);
      if (!mxRecords?.length) {
        return { tlsSupport: undefined, validCertificate: undefined };
      }

      mxRecords.sort((a, b) => a.priority - b.priority);
      const primaryMx = mxRecords[0].exchange;

      return await new Promise((resolve) => {
        const socket = tls.connect({
          host: primaryMx,
          port: 465,
          rejectUnauthorized: false,
          timeout: 5000,
        });

        socket.on('secureConnect', () => {
          resolve({ tlsSupport: true, validCertificate: socket.authorized });
          socket.end();
        });

        socket.on('error', () => {
          const starttlsSocket = new net.Socket();
          starttlsSocket.connect(587, primaryMx, () => {
            starttlsSocket.destroy();
            resolve({ tlsSupport: true, validCertificate: undefined });
          });
          starttlsSocket.on('error', () => {
            resolve({ tlsSupport: false, validCertificate: undefined });
          });
        });

        socket.setTimeout(5000, () => {
          socket.destroy();
          resolve({ tlsSupport: undefined, validCertificate: undefined });
        });
      });
    } catch (error: any) {
      this.logger.error(`Error checking TLS support: ${error.message}`);
      return { tlsSupport: undefined, validCertificate: undefined };
    }
  }
}
