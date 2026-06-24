import { Module } from '@nestjs/common';
import { AllocationsController } from './allocations.controller.js';

@Module({
  controllers: [AllocationsController]
})
export class AllocationsModule {}
