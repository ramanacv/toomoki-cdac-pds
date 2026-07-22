import { Module } from '@nestjs/common';
import { ProofsController } from './proofs.controller.js';
import { ProofsService } from './proofs.service.js';

@Module({ controllers: [ProofsController], providers: [ProofsService], exports: [ProofsService] })
export class ProofsModule {}
