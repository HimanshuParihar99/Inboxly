/**
 * Interface for IMAP connection configuration
 */
export interface ImapConnectionConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  authTimeout?: number;
  connTimeout?: number;
  debug?: (info: string) => void;
  tlsOptions?: {
    rejectUnauthorized?: boolean;
  };
  authMethod?: string; // 'PLAIN' | 'LOGIN' | 'OAUTH2'
  accessToken?: string; // For OAuth2
}

/**
 * Interface for IMAP connection status
 */
export interface ImapConnectionStatus {
  id: string;
  host: string;
  port: number;
  user: string;
  state: 'connected' | 'disconnected' | 'connecting' | 'error';
  error?: Error;
  lastActivity: Date;
}

/**
 * Interface for IMAP folder structure
 */
export interface ImapFolder {
  name: string;
  path: string;
  delimiter: string;
  attribs: string[];
  children?: ImapFolder[];
}

/**
 * Interface for email message flags
 */
export interface MessageFlags {
  seen?: boolean;
  answered?: boolean;
  flagged?: boolean;
  deleted?: boolean;
  draft?: boolean;
  recent?: boolean;
}

/**
 * Interface for email message headers
 */
export interface MessageHeaders {
  date?: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  [key: string]: string | undefined;
}

/**
 * Interface for email message structure
 */
export interface EmailMessage {
  uid: number;
  flags: MessageFlags;
  headers: MessageHeaders;
  size: number;
  date: Date;
  subject: string;
  from: {
    address: string;
    name: string;
  }[];
  to: {
    address: string;
    name: string;
  }[];
  cc?: {
    address: string;
    name: string;
  }[];
  bcc?: {
    address: string;
    name: string;
  }[];
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  html?: string;
  text?: string;
  attachments?: {
    filename: string;
    contentType: string;
    contentDisposition: string;
    contentId?: string;
    transferEncoding?: string;
    size: number;
    content?: Buffer;
  }[];
  source?: Buffer; // Raw email source
}

/**
 * Interface for email analytics data
 */
export interface EmailAnalytics {
  sender: string;
  senderDomain: string;
  esp?: string; // Email Service Provider
  timeDelta?: number; // Time difference between sent and received in milliseconds
  openRelay?: boolean;
  tlsSupport?: boolean;
  validCertificate?: boolean;
}

/**
 * Interface for email security information
 */
export interface EmailSecurityInfo {
  encrypted: boolean;
  spfPass: boolean;
  dkimPass: boolean;
  dmarcPass: boolean;
  potentialPhishing: boolean;
}