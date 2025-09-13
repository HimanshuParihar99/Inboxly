import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class OAuth2Strategy extends PassportStrategy(Strategy, 'oauth2') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      authorizationURL: configService.get<string>('OAUTH2_AUTH_URL') || '',
      tokenURL: configService.get<string>('OAUTH2_TOKEN_URL') || '',
      clientID: configService.get<string>('OAUTH2_CLIENT_ID') || '',
      clientSecret: configService.get<string>('OAUTH2_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('OAUTH2_CALLBACK_URL') || '',
      scope: ['email', 'profile', 'https://mail.google.com/'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    const email = profile.emails?.[0]?.value || profile.email;

    if (!email) {
      throw new Error('Email not provided by OAuth provider');
    }

    const user = await this.authService.findOrCreateOAuthUser({
      email,
      name: profile.displayName || profile.name || email.split('@')[0],
      accessToken,
      refreshToken,
      provider: 'oauth2',
      providerId: profile.id,
    });

    return user;
  }
}
