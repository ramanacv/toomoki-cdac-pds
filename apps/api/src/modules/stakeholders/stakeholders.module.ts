import { Module } from '@nestjs/common';
import { StakeholdersController } from './stakeholders.controller.js';

@Module({
  controllers: [StakeholdersController]
})
export class StakeholdersModule {}
