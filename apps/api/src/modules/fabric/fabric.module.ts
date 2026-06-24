import { Module } from '@nestjs/common';
import { loadFabricRuntimeConfig } from '../config/fabric.config.js';

@Module({
  providers: [
    {
      provide: 'FABRIC_RUNTIME_CONFIG',
      useFactory: () => loadFabricRuntimeConfig()
    }
  ],
  exports: ['FABRIC_RUNTIME_CONFIG']
})
export class FabricModule {}
