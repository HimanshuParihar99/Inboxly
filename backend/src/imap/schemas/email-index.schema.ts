import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class EmailIndex extends Document {
  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  sender: string;

  @Prop({ required: true })
  senderDomain: string;

  @Prop()
  recipients: string[];

  @Prop()
  cc: string[];

  @Prop()
  bcc: string[];

  @Prop()
  textContent: string;

  @Prop()
  htmlContent: string;

  @Prop()
  attachments: string[];

  @Prop({ required: true })
  date: Date;

  @Prop()
  folderPath: string;

  @Prop()
  userId: string;

  @Prop()
  connectionId: string;

  @Prop()
  tags: string[];
}

export const EmailIndexSchema = SchemaFactory.createForClass(EmailIndex);

// Add text index for full-text search
EmailIndexSchema.index(
  {
    subject: 'text',
    textContent: 'text',
    htmlContent: 'text',
    sender: 'text',
    recipients: 'text',
  },
  {
    weights: {
      subject: 10,
      textContent: 5,
      htmlContent: 3,
      sender: 2,
      recipients: 1,
    },
    name: 'email_text_index',
  },
);

// Add additional indexes for common queries
EmailIndexSchema.index({ userId: 1, date: -1 });
EmailIndexSchema.index({ userId: 1, folderPath: 1 });
EmailIndexSchema.index({ userId: 1, senderDomain: 1 });
EmailIndexSchema.index({ messageId: 1 }, { unique: true });