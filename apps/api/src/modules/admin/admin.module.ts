import { Module } from '@nestjs/common';
import { FabricModule } from '../fabric/fabric.module.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [FabricModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard]
})
export class AdminModule {}
