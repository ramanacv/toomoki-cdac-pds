import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { BeneficiaryLifecycleEvent } from '@pds/shared-types';
import { BeneficiaryRegistryRepository } from './beneficiary-registry.repository.js';

const opaqueHash = /(?:hash|^[a-f0-9]{64}$)/i;

@Injectable()
export class BeneficiaryRegistryService {
  constructor(@Inject(BeneficiaryRegistryRepository) private readonly repository: BeneficiaryRegistryRepository) {}

  summary() {
    return this.repository.summary();
  }

  apply(event: BeneficiaryLifecycleEvent) {
    for (const [field, value] of [
      ['beneficiaryRefHash', event.beneficiaryRefHash],
      ['rationCardHash', event.rationCardHash],
      ['parentBeneficiaryRefHash', event.parentBeneficiaryRefHash]
    ] as const) {
      if (value && !opaqueHash.test(value)) throw new BadRequestException(`${field} must be an opaque hash reference`);
    }
    if (event.parentBeneficiaryRefHash === event.beneficiaryRefHash) {
      throw new BadRequestException('parentBeneficiaryRefHash must reference a different registry record');
    }
    return this.repository.apply(event);
  }
}
