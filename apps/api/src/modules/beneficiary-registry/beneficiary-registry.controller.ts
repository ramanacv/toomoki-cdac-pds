import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { Plane } from '../../infrastructure/plane.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { BeneficiaryRegistryService } from './beneficiary-registry.service.js';
import { BeneficiaryLifecycleEventDto } from './dto/beneficiary-lifecycle.dto.js';

@Plane('control')
@Controller('/beneficiary-registry/v1')
@Roles('department', 'auditor', 'management')
export class BeneficiaryRegistryController {
  constructor(@Inject(BeneficiaryRegistryService) private readonly service: BeneficiaryRegistryService) {}

  @Get('/summary')
  summary() {
    return this.service.summary();
  }

  @Post('/events')
  @Roles('department')
  event(@Body() body: BeneficiaryLifecycleEventDto) {
    return this.service.apply(body);
  }
}
