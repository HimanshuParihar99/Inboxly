import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../services/auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Initiate OAuth2 authentication flow
   */
  @Get('google')
  @UseGuards(AuthGuard('oauth2'))
  async googleAuth() {
    // This route initiates the OAuth2 flow
    // The guard will redirect to the OAuth provider
  }

  /**
   * Handle OAuth2 callback
   * @param req Request object
   * @param res Response object
   */
  @Get('callback')
  @UseGuards(AuthGuard('oauth2'))
  async googleAuthCallback(@Req() req, @Res() res) {
    // The user has been authenticated and is available in req.user
    const { access_token, user } = req.user;
    
    // Redirect to the frontend with the token
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/callback?token=${access_token}`);
  }
}