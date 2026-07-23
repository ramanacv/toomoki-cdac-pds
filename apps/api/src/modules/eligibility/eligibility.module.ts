import { Module } from '@nestjs/common';
import { EligibilityController } from './eligibility.controller.js';
import {
  ELIGIBILITY_SCREENING_ADAPTER,
  EligibilityClient,
  HttpEligibilityScreeningAdapter
} from './eligibility-client.js';
import { EligibilityService } from './eligibility.service.js';
import { EligibilityRepository } from './eligibility.repository.js';

@Module({
  controllers: [EligibilityController],
  providers: [
    EligibilityService,
    EligibilityRepository,
    EligibilityClient,
    { provide: ELIGIBILITY_SCREENING_ADAPTER, useClass: HttpEligibilityScreeningAdapter }
  ],
  exports: [EligibilityService]
})
export class EligibilityModule {}
