import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { BusinessAuthGuard } from './auth.guard.js';
import { IDENTITY_PROVIDER } from './identity-provider.js';
import { StubIdentityProvider } from './stub-identity-provider.js';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: IDENTITY_PROVIDER, useClass: StubIdentityProvider },
    { provide: APP_GUARD, useClass: BusinessAuthGuard }
  ]
})
export class AuthModule {}
