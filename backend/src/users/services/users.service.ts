import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

interface OAuthUserData {
  name: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  provider: string;
  providerId: string;
}

interface OAuthUpdateData {
  accessToken: string;
  refreshToken?: string;
  provider: string;
  providerId: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Find a user by email
   * @param email User email
   * @returns User document or null
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  /**
   * Find a user by ID
   * @param id User ID
   * @returns User document or null
   */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Create a new user
   * @param name User name
   * @param email User email
   * @param hashedPassword Hashed password
   * @returns Created user document
   */
  async create(
    name: string,
    email: string,
    hashedPassword: string,
  ): Promise<UserDocument> {
    const newUser = new this.userModel({
      name,
      email,
      password: hashedPassword,
      isOAuthUser: false,
    });
    return newUser.save();
  }

  /**
   * Create a new user with OAuth credentials
   * @param userData OAuth user data
   * @returns Created user document
   */
  async createOAuthUser(userData: OAuthUserData): Promise<UserDocument> {
    const { name, email, accessToken, refreshToken, provider, providerId } = userData;
    
    const newUser = new this.userModel({
      name,
      email,
      accessToken,
      refreshToken,
      provider,
      providerId,
      isOAuthUser: true,
    });
    
    return newUser.save();
  }

  /**
   * Update OAuth information for an existing user
   * @param userId User ID
   * @param oauthData OAuth update data
   * @returns Updated user document
   */
  async updateOAuthInfo(userId: string, oauthData: OAuthUpdateData): Promise<UserDocument> {
    const { accessToken, refreshToken, provider, providerId } = oauthData;
    
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        accessToken,
        refreshToken,
        provider,
        providerId,
        isOAuthUser: true,
      },
      { new: true },
    ).exec();
    
    if (!updatedUser) {
      throw new Error(`User with ID ${userId} not found`);
    }
    
    return updatedUser;
  }
}