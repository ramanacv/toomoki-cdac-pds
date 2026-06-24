import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import type { Identity, Signer } from '@hyperledger/fabric-gateway';
import { signers } from '@hyperledger/fabric-gateway';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';

export type FabricIdentityMaterial = {
  mspId: string;
  credentials: Buffer;
  privateKeyPem: Buffer;
};

export class FabricIdentityService {
  constructor(private readonly config: FabricRuntimeConfig) {}

  async loadIdentityMaterial(): Promise<FabricIdentityMaterial> {
    const credentials = await readFile(this.config.certPath);
    const privateKeyPem = await this.resolvePrivateKeyPem(this.config.keyPath);
    return {
      mspId: this.config.mspId,
      credentials,
      privateKeyPem
    };
  }

  async toGatewayIdentity(material: FabricIdentityMaterial): Promise<Identity> {
    return {
      mspId: material.mspId,
      credentials: material.credentials
    };
  }

  async toGatewaySigner(material: FabricIdentityMaterial): Promise<Signer> {
    const privateKey = createPrivateKey(material.privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
  }

  private async resolvePrivateKeyPem(keyPath: string): Promise<Buffer> {
    try {
      return await readFile(keyPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const entries = await readdir(keyPath);
    const keyFile = entries.find((entry) => entry.endsWith('_sk') || entry.endsWith('.pem'));
    if (!keyFile) {
      throw new Error(`No private key found under ${keyPath}`);
    }
    return readFile(join(keyPath, keyFile));
  }
}
