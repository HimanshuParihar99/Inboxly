import { Injectable } from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

interface OAuthUserData {
  email: string;
  name: string;
  accessToken: string;
  refreshToken?: string;
  provider: string;
  providerId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);

    if (user?.password && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user.toObject();
      return result;
    }

    return null;
  }

  /**
   * Generate JWT token for authenticated user
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
   */
  async register(name: string, email: string, password: string) {
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(
      name,
      email,
      hashedPassword,
    );

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

  /**
   * Find or create a user from OAuth authentication
   */
  async findOrCreateOAuthUser(userData: OAuthUserData) {
    const { email, name, accessToken, refreshToken, provider, providerId } = userData;

    let user = await this.usersService.findByEmail(email);

    if (user) {
      user = await this.usersService.updateOAuthInfo(String(user._id), {
        accessToken,
        refreshToken,
        provider,
        providerId,
      });
    } else {
      user = await this.usersService.createOAuthUser({
        name,
        email,
        accessToken,
        refreshToken,
        provider,
        providerId,
      });
    }

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
