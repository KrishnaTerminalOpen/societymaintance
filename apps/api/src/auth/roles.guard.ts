import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { UserRole, hasRole, JwtAccessTokenPayload } from '@colony/shared';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user?: JwtAccessTokenPayload }).user;

    if (!user) {
      throw new ForbiddenException('User context missing');
    }

    const isAuthorized = hasRole(user.role, requiredRoles);
    if (!isAuthorized) {
      throw new ForbiddenException(
        `Access Denied: Requires one of [${requiredRoles.join(', ')}]. Current role: ${user.role}`,
      );
    }

    return true;
  }
}

