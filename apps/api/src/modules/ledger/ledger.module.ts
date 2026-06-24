import { Module } from '@nestjs/common';
import { createLedgerPortFromEnv } from './ledger-port-factory.js';
import { PDS_LEDGER_PORT } from './ledger.constants.js';

@Module({
  providers: [
    {
      provide: PDS_LEDGER_PORT,
      useFactory: () => createLedgerPortFromEnv()
    }
  ],
  exports: [PDS_LEDGER_PORT]
})
export class LedgerModule {}
