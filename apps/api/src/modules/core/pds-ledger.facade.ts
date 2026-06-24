import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import { PDS_LEDGER_PORT } from '../ledger/ledger.constants.js';
import { PdsRuntime } from './pds-runtime.js';

@Injectable()
export class PdsLedgerFacade extends PdsRuntime implements OnModuleInit {
  constructor(@Inject(PDS_LEDGER_PORT) port: PdsLedgerPort) {
    super(true, port, { deferBootstrap: true });
  }

  async onModuleInit(): Promise<void> {
    await this.bootstrapFromPersistenceAsync();
  }
}
