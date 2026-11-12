import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken, JwtAccessTokenPayload } from '@colony/shared';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (request.cookies && request.cookies['colony_access_token']) {
      token = request.cookies['colony_access_token'];
    }

    if (!token) {
      throw new UnauthorizedException('Authentication token missing.');
    }

    const payload = await verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    // Attach user payload to Express request
    (request as unknown as { user: JwtAccessTokenPayload }).user = payload;
    return true;
  }
}

