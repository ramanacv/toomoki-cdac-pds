import { Module } from '@nestjs/common';
import { BeneficiaryRegistryController } from './beneficiary-registry.controller.js';
import { BeneficiaryRegistryRepository } from './beneficiary-registry.repository.js';
import { BeneficiaryRegistryService } from './beneficiary-registry.service.js';

@Module({
  controllers: [BeneficiaryRegistryController],
  providers: [BeneficiaryRegistryRepository, BeneficiaryRegistryService],
  exports: [BeneficiaryRegistryService]
})
export class BeneficiaryRegistryModule {}
