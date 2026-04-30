import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // Allow if session is authenticated (admin logged in via browser)
    if (request.session?.authenticated) {
      return true;
    }

    // Check x-api-key header
    const apiKey = request.headers['x-api-key'];
    const expectedKey = process.env.API_KEY;
    if (!apiKey || !expectedKey) {
      throw new UnauthorizedException('API key diperlukan');
    }

    // Constant-time comparison
    const hmacKey = 'api-key-compare';
    const ha = createHmac('sha256', hmacKey).update(apiKey).digest();
    const hb = createHmac('sha256', hmacKey).update(expectedKey).digest();
    if (!timingSafeEqual(ha, hb)) {
      throw new UnauthorizedException('API key tidak valid');
    }

    return true;
  }
}
