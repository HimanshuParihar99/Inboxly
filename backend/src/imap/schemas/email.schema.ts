import { Schema, Document } from 'mongoose';
import { EmailAnalytics, EmailSecurityInfo } from '../interfaces/imap-connection.interface';

export interface Email extends Document {
  messageId: string;
  connectionId: string;
  folderPath: string;
  uid: number;
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
  date: Date;
  receivedDate: Date;
  flags: {
    seen: boolean;
    answered: boolean;
    flagged: boolean;
    deleted: boolean;
    draft: boolean;
    recent: boolean;
  };
  size: number;
  html?: string;
  text?: string;
  hasAttachments: boolean;
  attachments?: {
    filename: string;
    contentType: string;
    size: number;
  }[];
  headers: Record<string, string>;
  analytics: EmailAnalytics;
  securityInfo?: EmailSecurityInfo;
  createdAt: Date;
  updatedAt: Date;
}

export const EmailSchema = new Schema<Email>(
  {
    messageId: { type: String, required: true, index: true },
    connectionId: { type: String, required: true, index: true },
    folderPath: { type: String, required: true, index: true },
    uid: { type: Number, required: true },
    subject: { type: String, required: true, index: 'text' },
    from: [
      {
        address: { type: String, required: true, index: true },
        name: { type: String },
      },
    ],
    to: [
      {
        address: { type: String, required: true },
        name: { type: String },
      },
    ],
    cc: [
      {
        address: { type: String },
        name: { type: String },
      },
    ],
    bcc: [
      {
        address: { type: String },
        name: { type: String },
      },
    ],
    date: { type: Date, required: true, index: true },
    receivedDate: { type: Date, required: true },
    flags: {
      seen: { type: Boolean, default: false },
      answered: { type: Boolean, default: false },
      flagged: { type: Boolean, default: false },
      deleted: { type: Boolean, default: false },
      draft: { type: Boolean, default: false },
      recent: { type: Boolean, default: false },
    },
    size: { type: Number, required: true },
    html: { type: String, index: 'text' },
    text: { type: String, index: 'text' },
    hasAttachments: { type: Boolean, default: false },
    attachments: [
      {
        filename: { type: String },
        contentType: { type: String },
        size: { type: Number },
      },
    ],
    headers: { type: Map, of: String },
    analytics: {
      sender: { type: String, required: true },
      senderDomain: { type: String, required: true, index: true },
      esp: { type: String },
      timeDelta: { type: Number },
      openRelay: { type: Boolean },
      tlsSupport: { type: Boolean },
      validCertificate: { type: Boolean },
    },
    securityInfo: {
      encrypted: { type: Boolean, default: false },
      spfPass: { type: Boolean, default: false },
      dkimPass: { type: Boolean, default: false },
      dmarcPass: { type: Boolean, default: false },
      potentialPhishing: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  },
);

// Create compound indexes for efficient querying
EmailSchema.index({ connectionId: 1, folderPath: 1, uid: 1 }, { unique: true });
EmailSchema.index({ 'analytics.senderDomain': 1, date: -1 });
EmailSchema.index({ 'from.address': 1, date: -1 });
EmailSchema.index({ 'securityInfo.encrypted': 1 });
EmailSchema.index({ 'securityInfo.potentialPhishing': 1 });
EmailSchema.index({ connectionId: 1, 'securityInfo.encrypted': 1 });