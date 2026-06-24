import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module.js';
import { FabricModule } from './modules/fabric/fabric.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OpenapiModule } from './modules/openapi/openapi.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { StakeholdersModule } from './modules/stakeholders/stakeholders.module.js';
import { LotsModule } from './modules/lots/lots.module.js';
import { TransfersModule } from './modules/transfers/transfers.module.js';
import { AllocationsModule } from './modules/allocations/allocations.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EntitlementsModule } from './modules/entitlements/entitlements.module.js';
import { DistributionsModule } from './modules/distributions/distributions.module.js';
import { TraceModule } from './modules/trace/trace.module.js';
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    CoreModule,
    FabricModule,
    HealthModule,
    OpenapiModule,
    DashboardModule,
    StakeholdersModule,
    LotsModule,
    TransfersModule,
    AllocationsModule,
    AuthModule,
    EntitlementsModule,
    DistributionsModule,
    TraceModule,
    AuditModule
  ]
})
export class AppModule {}
