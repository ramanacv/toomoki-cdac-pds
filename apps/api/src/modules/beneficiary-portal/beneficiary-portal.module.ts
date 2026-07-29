import { Module } from '@nestjs/common';
import { EligibilityModule } from '../eligibility/eligibility.module.js';
import { ProofsModule } from '../proofs/proofs.module.js';
import { BeneficiaryPortalController } from './beneficiary-portal.controller.js';
import { BeneficiaryPortalService } from './beneficiary-portal.service.js';

@Module({
  imports: [EligibilityModule, ProofsModule],
  controllers: [BeneficiaryPortalController],
  providers: [BeneficiaryPortalService]
})
export class BeneficiaryPortalModule {}
