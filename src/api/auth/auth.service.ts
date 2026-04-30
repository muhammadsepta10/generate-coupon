import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@common/config/app-config/app-config.service';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private readonly config: AppConfigService) {}

  validateCredentials(username: string, password: string): boolean {
    const expectedUser = this.config.ADMIN_USERNAME || 'admin';
    const expectedPass = this.config.ADMIN_PASSWORD;
    if (!expectedPass) return false;

    // Constant-time comparison to prevent timing attacks
    const userMatch = this._safeCompare(username, expectedUser);
    const passMatch = this._safeCompare(password, expectedPass);
    return userMatch && passMatch;
  }

  getApiKey(): string {
    return this.config.API_KEY || '';
  }

  private _safeCompare(a: string, b: string): boolean {
    const hmacKey = 'compare';
    const ha = createHmac('sha256', hmacKey).update(a).digest();
    const hb = createHmac('sha256', hmacKey).update(b).digest();
    return timingSafeEqual(ha, hb);
  }
}
