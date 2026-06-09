import { Module } from '@nestjs/common';
import { PdsController } from './pds.controller.js';
import { PdsService } from './pds.service.js';

@Module({
  controllers: [PdsController],
  providers: [PdsService]
})
export class AppModule {}
