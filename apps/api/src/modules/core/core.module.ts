import { Global, Module } from '@nestjs/common';
import { PdsLedgerFacade } from './pds-ledger.facade.js';
import { LedgerModule } from '../ledger/ledger.module.js';

@Global()
@Module({
  imports: [LedgerModule],
  providers: [PdsLedgerFacade],
  exports: [PdsLedgerFacade]
})
export class CoreModule {}
