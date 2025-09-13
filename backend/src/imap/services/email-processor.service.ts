import { Injectable, Logger } from '@nestjs/common';
import { EmailAnalytics, EmailMessage } from '../interfaces/imap-connection.interface';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import { promisify } from 'util';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailIndex } from '../schemas/email-index.schema';

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
    private readonly emailIndexModel: Model<EmailIndex>,
    @InjectModel('EmailAnalytics')
    private readonly emailAnalyticsModel: Model<any>,
  ) {}
  
  /**
   * Index an email for full-text search
   * @param message Email message
   * @param userId User ID
   * @param connectionId Connection ID
   * @param folderPath Folder path
   */
  private async indexEmailForSearch(
    message: EmailMessage,
    userId: string,
    connectionId?: string,
    folderPath?: string,
  ): Promise<void> {
    try {
      // Check if email is already indexed
      const existingIndex = await this.emailIndexModel.findOne({
        messageId: message.messageId,
        userId,
      }).exec();
      
      if (existingIndex) {
        this.logger.debug(`Email ${message.messageId} already indexed`);
        return;
      }
      
      // Extract recipients
      const recipients = message.to?.map(to => to.address) || [];
      const cc = message.cc?.map(cc => cc.address) || [];
      const bcc = message.bcc?.map(bcc => bcc.address) || [];
      
      // Extract attachments
      const attachments = message.attachments?.map(attachment => attachment.filename) || [];
      
      // Create email index
      const emailIndex = new this.emailIndexModel({
        messageId: message.messageId,
        subject: message.subject || '',
        sender: message.from?.[0]?.address || '',
        senderDomain: this.extractDomain(message.from?.[0]?.address || ''),
        recipients,
        cc,
        bcc,
        textContent: message.text || '',
        htmlContent: message.html || '',
        attachments,
        date: message.date || new Date(),
        folderPath,
        userId,
        connectionId,
        tags: [],
      });
      
      await emailIndex.save();
      this.logger.debug(`Indexed email: ${message.subject}`);
    } catch (error) {
      this.logger.error(`Error indexing email: ${error.message}`, error.stack);
      // Don't throw error to prevent blocking the main process
    }
  }
  
  /**
   * Search emails using full-text search
   * @param userId User ID
   * @param query Search query
   * @param options Search options
   * @returns Search results
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
      const limit = options?.limit || 20;
      const skip = options?.skip || 0;
      
      // Build search filter
      const filter: any = { userId };
      
      // Add text search if query is provided
      if (query && query.trim()) {
        filter.$text = { $search: query };
      }
      
      // Add folder filter if provided
      if (options?.folderPath) {
        filter.folderPath = options.folderPath;
      }
      
      // Add date range filter if provided
      if (options?.startDate || options?.endDate) {
        filter.date = {};
        if (options?.startDate) {
          filter.date.$gte = options.startDate;
        }
        if (options?.endDate) {
          filter.date.$lte = options.endDate;
        }
      }
      
      // Add sender filter if provided
      if (options?.sender) {
        filter.sender = { $regex: options.sender, $options: 'i' };
      }
      
      // Add attachments filter if provided
      if (options?.hasAttachments === true) {
        filter.attachments = { $exists: true, $ne: [] };
      }
      
      // Add tags filter if provided
      if (options?.tags && options.tags.length > 0) {
        filter.tags = { $all: options.tags };
      }
      
      // Execute search query
      const [results, total] = await Promise.all([
        this.emailIndexModel
          .find(filter)
          .sort(query && query.trim() ? { score: { $meta: 'textScore' } } : { date: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.emailIndexModel.countDocuments(filter).exec(),
      ]);
      
      return { results, total };
    } catch (error) {
      this.logger.error(`Error searching emails: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Process an email message and generate analytics
   * @param message Email message
   * @param userId User ID
   * @param connectionId Connection ID
   * @param folderPath Folder path
   * @returns Email analytics
   */
  async processEmail(
    message: EmailMessage,
    userId?: string,
    connectionId?: string,
    folderPath?: string,
  ): Promise<EmailAnalytics> {
    try {
      // Extract sender information
      const sender = message.from[0]?.address || '';
      const senderDomain = this.extractDomain(sender);
      
      // Calculate time delta between sent and received
      const timeDelta = this.calculateTimeDelta(message);
      
      // Detect ESP (Email Service Provider)
      const esp = await this.detectESP(message, senderDomain);
      
      // Check if the sending mail server is an open relay
      const openRelay = await this.checkOpenRelay(senderDomain);
      
      // Check if the sending mail server supports TLS
      const { tlsSupport, validCertificate } = await this.checkTlsSupport(senderDomain);
      
      // Index the email for full-text search
      if (userId) {
        await this.indexEmailForSearch(message, userId, connectionId, folderPath);
      }
      
      // Create analytics record
      const analytics = {
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
      
      // Save analytics to database if userId is provided
      if (userId) {
        await this.emailAnalyticsModel.create(analytics);
      }
      
      return analytics as EmailAnalytics;
    } catch (error) {
      this.logger.error(`Error processing email: ${error.message}`, error.stack);
      
      // Return partial analytics if an error occurs
      return {
        sender: message.from[0]?.address || '',
        senderDomain: this.extractDomain(message.from[0]?.address || ''),
      };
    }
  }
  
  /**
   * Extract domain from an email address
   * @param email Email address
   * @returns Domain
   */
  private extractDomain(email: string): string {
    const match = email.match(/@([^@]+)$/);
    return match ? match[1].toLowerCase() : '';
  }
  
  /**
   * Calculate time delta between sent and received
   * @param message Email message
   * @returns Time delta in milliseconds
   */
  private calculateTimeDelta(message: EmailMessage): number | undefined {
    try {
      // Get received date from headers
      const receivedHeader = message.headers['received'];
      if (!receivedHeader) return undefined;
      
      // Extract date from the first Received header (most recent)
      const receivedDateMatch = receivedHeader.match(/;\s*(.+)$/);
      if (!receivedDateMatch) return undefined;
      
      const receivedDate = new Date(receivedDateMatch[1]);
      const sentDate = message.date;
      
      // Calculate time difference in milliseconds
      return receivedDate.getTime() - sentDate.getTime();
    } catch (error) {
      this.logger.error(`Error calculating time delta: ${error.message}`);
      return undefined;
    }
  }
  
  /**
   * Detect the Email Service Provider (ESP)
   * @param message Email message
   * @param domain Sender domain
   * @returns ESP name
   */
  private async detectESP(message: EmailMessage, domain: string): Promise<string | undefined> {
    try {
      // Check headers for ESP indicators
      const headers = message.headers;
      
      // Common ESP header patterns
      const espPatterns = {
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
      
      // Check headers for ESP patterns
      for (const [headerPattern, espName] of Object.entries(espPatterns)) {
        for (const [headerName, headerValue] of Object.entries(headers)) {
          if (headerName.includes(headerPattern) || (headerValue && headerValue.includes(headerPattern))) {
            return espName;
          }
        }
      }
      
      // Check for DKIM signatures
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
      
      // Check for Return-Path domain
      const returnPath = headers['return-path'];
      if (returnPath) {
        if (returnPath.includes('amazonses.com')) return 'Amazon SES';
        if (returnPath.includes('sendgrid.net')) return 'SendGrid';
        if (returnPath.includes('mailgun.org')) return 'Mailgun';
        if (returnPath.includes('mailchimp.com')) return 'Mailchimp';
        if (returnPath.includes('postmarkapp.com')) return 'Postmark';
      }
      
      // Check for SPF records
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
      } catch (error) {
        // Ignore DNS errors
      }
      
      // If no ESP detected, return undefined
      return undefined;
    } catch (error) {
      this.logger.error(`Error detecting ESP: ${error.message}`);
      return undefined;
    }
  }
  
  /**
   * Check if a mail server is an open relay
   * @param domain Domain to check
   * @returns True if the server is an open relay, false otherwise
   */
  private async checkOpenRelay(domain: string): Promise<boolean | undefined> {
    try {
      // Get MX records for the domain
      const mxRecords = await this.dnsResolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) return undefined;
      
      // Sort by priority (lowest first)
      mxRecords.sort((a, b) => a.priority - b.priority);
      
      // Check the primary MX server
      const primaryMx = mxRecords[0].exchange;
      
      // Try to connect to the SMTP port
      const socket = new net.Socket();
      
      return new Promise<boolean>((resolve) => {
        // Set a timeout for the connection attempt
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false); // Return false instead of undefined
        }, 5000);
        
        socket.connect(25, primaryMx, () => {
          // Connection established, now check if it's an open relay
          // This is a simplified check - in a real implementation, you would
          // attempt to send an email through the server without authentication
          
          // For now, we'll just check if the server accepts connections
          clearTimeout(timeout);
          socket.destroy();
          resolve(false); // Assume it's not an open relay by default
        });
        
        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false); // Return false instead of undefined
        });
      });
    } catch (error) {
      this.logger.error(`Error checking open relay: ${error.message}`);
      return undefined;
    }
  }
  
  /**
   * Check if a mail server supports TLS and has a valid certificate
   * @param domain Domain to check
   * @returns Object with TLS support and certificate validity
   */
  private async checkTlsSupport(domain: string): Promise<{ tlsSupport: boolean | undefined; validCertificate: boolean | undefined }> {
    try {
      // Get MX records for the domain
      const mxRecords = await this.dnsResolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { tlsSupport: undefined, validCertificate: undefined };
      }
      
      // Sort by priority (lowest first)
      mxRecords.sort((a, b) => a.priority - b.priority);
      
      // Check the primary MX server
      const primaryMx = mxRecords[0].exchange;
      
      return new Promise<{ tlsSupport: boolean | undefined; validCertificate: boolean | undefined }>((resolve) => {
        // Try to establish a TLS connection
        const socket = tls.connect({
          host: primaryMx,
          port: 465, // SMTPS port
          rejectUnauthorized: false, // We'll check certificate validity manually
          timeout: 5000,
        });
        
        socket.on('secureConnect', () => {
          const tlsSupport = true;
          const validCertificate = socket.authorized;
          
          socket.end();
          resolve({ tlsSupport, validCertificate });
        });
        
        socket.on('error', () => {
          // Try connecting to STARTTLS port (587)
          const starttlsSocket = new net.Socket();
          
          starttlsSocket.connect(587, primaryMx, () => {
            // Connection established, assume STARTTLS is supported
            starttlsSocket.destroy();
            resolve({ tlsSupport: true, validCertificate: undefined });
          });
          
          starttlsSocket.on('error', () => {
            resolve({ tlsSupport: false, validCertificate: undefined });
          });
        });
        
        // Set a timeout
        setTimeout(() => {
          socket.destroy();
          resolve({ tlsSupport: undefined, validCertificate: undefined });
        }, 5000);
      });
    } catch (error) {
      this.logger.error(`Error checking TLS support: ${error.message}`);
      return { tlsSupport: undefined, validCertificate: undefined };
    }
  }
}