import { Module } from '@nestjs/common';
import { LotsController } from './lots.controller.js';

@Module({
  controllers: [LotsController]
})
export class LotsModule {}
