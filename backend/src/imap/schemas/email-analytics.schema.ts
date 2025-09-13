import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class EmailAnalytics extends Document {
  @Prop({ required: true })
  messageId: string;

  @Prop()
  subject: string;

  @Prop({ required: true })
  sender: string;

  @Prop({ required: true })
  senderDomain: string;

  @Prop()
  sendingEsp: string;

  @Prop()
  sentDate: Date;

  @Prop()
  receivedDate: Date;

  @Prop()
  timeDeltaMinutes: number;

  @Prop({ default: false })
  isOpenRelay: boolean;

  @Prop({ default: false })
  supportsTls: boolean;

  @Prop({ default: false })
  hasValidCertificate: boolean;

  @Prop({ type: Object })
  certificateInfo: {
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
  };

  @Prop()
  userId: string;

  @Prop()
  connectionId: string;
}

export const EmailAnalyticsSchema = SchemaFactory.createForClass(EmailAnalytics);

// Add indexes for common queries
EmailAnalyticsSchema.index({ userId: 1, sentDate: -1 });
EmailAnalyticsSchema.index({ userId: 1, senderDomain: 1 });
EmailAnalyticsSchema.index({ messageId: 1 }, { unique: true });
EmailAnalyticsSchema.index({ sendingEsp: 1 });