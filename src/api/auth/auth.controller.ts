import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @HttpCode(200)
  login(
    @Body() body: { username: string; password: string },
    @Req() req: Request,
  ) {
    const { username, password } = body;
    if (!username || !password) {
      return { success: false, message: 'Username dan password harus diisi' };
    }

    const valid = this.authService.validateCredentials(username, password);
    if (!valid) {
      return { success: false, message: 'Username atau password salah' };
    }

    // Set session
    (req.session as any).authenticated = true;
    (req.session as any).username = username;
    (req.session as any).loginAt = Date.now();

    return {
      success: true,
      message: 'Login berhasil',
      apiKey: this.authService.getApiKey(),
    };
  }

  @Post('/logout')
  @HttpCode(200)
  logout(@Req() req: Request) {
    return new Promise<{ success: boolean; message: string }>((resolve) => {
      req.session.destroy((err) => {
        resolve({
          success: true,
          message: 'Logout berhasil',
        });
      });
    });
  }

  @Get('/check')
  check(@Req() req: Request) {
    const authenticated = !!(req.session as any)?.authenticated;
    return {
      authenticated,
      username: authenticated ? (req.session as any).username : null,
    };
  }
}
