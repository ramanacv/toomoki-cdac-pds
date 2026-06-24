import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller.js';

@Module({
  controllers: [TransfersController]
})
export class TransfersModule {}
