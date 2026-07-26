import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { BusinessAuthGuard } from './auth.guard.js';
import { IDENTITY_PROVIDER } from './identity-provider.js';
import { OidcIdentityProvider } from './oidc-identity-provider.js';
import { TestIdentityProvider } from './stub-identity-provider.js';
import { DurableAuthorizationService } from './durable-authorization.service.js';
import {
  createEposAuthAdapter,
  EPOS_AUTH_ADAPTER,
  EposAuthClient
} from './epos-auth-client.js';

export const createIdentityProvider = () => {
  const mode = (process.env.PDS_AUTH_MODE ?? 'oidc').toLowerCase();
  if (mode === 'test') {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('PDS_AUTH_MODE=test is only permitted when NODE_ENV=test');
    }
    return new TestIdentityProvider();
  }
  if (mode !== 'oidc') throw new Error(`Unsupported PDS_AUTH_MODE: ${mode}`);
  return new OidcIdentityProvider();
};

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    { provide: IDENTITY_PROVIDER, useFactory: createIdentityProvider },
    DurableAuthorizationService,
    { provide: APP_GUARD, useClass: BusinessAuthGuard },
    { provide: EPOS_AUTH_ADAPTER, useFactory: createEposAuthAdapter },
    EposAuthClient
  ],
  exports: [DurableAuthorizationService, EposAuthClient]
})
export class AuthModule {}
