import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ImapConnectionDocument = ImapConnection & Document;

@Schema({ timestamps: true })
export class ImapConnection {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  host: string;

  @Prop({ required: true })
  port: number;

  @Prop({
    required: true,
    enum: ['PLAIN', 'LOGIN', 'OAUTH2'],
    default: 'PLAIN',
  })
  authMethod: string;

  @Prop({ required: true })
  username: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ default: true })
  tls: boolean;

  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: { rejectUnauthorized: false },
  })
  tlsOptions: {
    rejectUnauthorized: boolean;
  };

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ default: null })
  lastSyncedAt: Date;

  @Prop({ default: 'idle', enum: ['idle', 'syncing', 'paused', 'error'] })
  syncStatus: string;

  @Prop({ default: null })
  syncError: string;

  @Prop({ default: 0 })
  totalEmails: number;

  @Prop({ default: 0 })
  syncedEmails: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: User;

  @Prop({
    type: {
      tlsSupport: Boolean,
      openRelay: Boolean,
      certificateValid: Boolean,
    },
    default: {},
  })
  securityInfo: {
    tlsSupport: boolean;
    openRelay: boolean;
    certificateValid: boolean;
  };
}

export const ImapConnectionSchema =
  SchemaFactory.createForClass(ImapConnection);

// Add a transform to exclude sensitive data when converting to JSON
ImapConnectionSchema.set('toJSON', {
  transform: (doc, ret) => {
    // Create a new object without the password field instead of using delete
    const { password, ...safeRet } = ret;
    return safeRet;
  },
});
