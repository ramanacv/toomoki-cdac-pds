import { Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller.js';

@Module({
  controllers: [EntitlementsController]
})
export class EntitlementsModule {}
