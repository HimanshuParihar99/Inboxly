import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { LocalAuthGuard } from '../guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Login endpoint
   * @param req Request object containing authenticated user
   * @returns JWT token and user info
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  /**
   * Register endpoint
   * @param registerData Registration data
   * @returns JWT token and user info
   */
  @Post('register')
  async register(
    @Body() registerData: { name: string; email: string; password: string },
  ) {
    return this.authService.register(
      registerData.name,
      registerData.email,
      registerData.password,
    );
  }
}