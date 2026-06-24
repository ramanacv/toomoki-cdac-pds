import { readFile } from 'node:fs/promises';
import * as grpc from '@grpc/grpc-js';
import { connect, type Contract, type Gateway } from '@hyperledger/fabric-gateway';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { FabricIdentityService } from './fabric-identity.service.js';

export type FabricGatewayConnection = {
  client: grpc.Client;
  gateway: Gateway;
  contract: Contract;
  close: () => void;
};

export const createFabricGatewayConnection = async (
  config: FabricRuntimeConfig
): Promise<FabricGatewayConnection> => {
  const identityService = new FabricIdentityService(config);
  const material = await identityService.loadIdentityMaterial();
  const tlsRootCert = await readFile(config.peerTlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  const client = new grpc.Client(config.peerEndpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': config.peerHostAlias
  });

  const gateway = connect({
    client,
    identity: await identityService.toGatewayIdentity(material),
    signer: await identityService.toGatewaySigner(material),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 })
  });

  const network = gateway.getNetwork(config.channel);
  const contract = network.getContract(config.chaincode);

  return {
    client,
    gateway,
    contract,
    close: () => {
      gateway.close();
      client.close();
    }
  };
};
