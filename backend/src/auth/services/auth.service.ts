import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validate user credentials
   * @param email User email
   * @param password User password
   * @returns User object if valid, null otherwise
   */
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user.toObject();
      return result;
    }
    return null;
  }

  /**
   * Generate JWT token for authenticated user
   * @param user User object
   * @returns Access token
   */
  async login(user: any) {
    const payload = { email: user.email, sub: user._id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Register a new user
   * @param name User name
   * @param email User email
   * @param password User password
   * @returns New user object and access token
   */
  async register(name: string, email: string, password: string) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(
      name,
      email,
      hashedPassword
    );

    // Generate token
    const { password: _, ...result } = user.toObject();
    const payload = { email: user.email, sub: user._id };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  }
}