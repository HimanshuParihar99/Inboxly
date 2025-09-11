import { Schema, Document } from 'mongoose';
import { ImapConnectionConfig } from '../interfaces/imap-connection.interface';

export interface Connection extends Document {
  userId: string;
  name: string;
  config: ImapConnectionConfig;
  lastSyncDate?: Date;
  folderMapping?: Record<string, string>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const ConnectionSchema = new Schema<Connection>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    config: {
      user: { type: String, required: true },
      password: { type: String, required: true },
      host: { type: String, required: true },
      port: { type: Number, required: true },
      tls: { type: Boolean, required: true },
      authTimeout: { type: Number },
      connTimeout: { type: Number },
      tlsOptions: {
        rejectUnauthorized: { type: Boolean },
      },
      authMethod: { type: String },
      accessToken: { type: String },
    },
    lastSyncDate: { type: Date },
    folderMapping: { type: Map, of: String },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

// Create compound index for user connections
ConnectionSchema.index({ userId: 1, name: 1 }, { unique: true });