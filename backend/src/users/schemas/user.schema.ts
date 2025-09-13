import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  toJSON: {
    transform: (doc, ret: any) => {
      // Use object destructuring instead of delete operator
      // Use type assertion to handle the password property
      const { password, accessToken, refreshToken, ...userWithoutSensitiveInfo } = 
        ret as { password?: string; accessToken?: string; refreshToken?: string; [key: string]: any };
      return userWithoutSensitiveInfo;
    },
  },
})
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: false })
  password?: string;
  
  @Prop({ required: false })
  accessToken?: string;
  
  @Prop({ required: false })
  refreshToken?: string;
  
  @Prop({ required: false })
  provider?: string;
  
  @Prop({ required: false })
  providerId?: string;
  
  @Prop({ required: false, default: false })
  isOAuthUser: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);