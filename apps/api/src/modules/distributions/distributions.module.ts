import { Module } from '@nestjs/common';
import { DistributionsController } from './distributions.controller.js';

@Module({
  controllers: [DistributionsController]
})
export class DistributionsModule {}
