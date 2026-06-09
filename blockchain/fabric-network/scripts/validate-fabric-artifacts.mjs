import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../../..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

export function validateFabricArtifacts() {
  const manifest = JSON.parse(read('blockchain/fabric-network/network-manifest.json'));
  const contract = JSON.parse(read('blockchain/fabric-network/fabric-contract.json'));
  const compose = read('blockchain/fabric-network/docker-compose.fabric.yml');
  const env = read('blockchain/fabric-network/fabric-env.example');

  const profileFiles = [
    'food-department.json',
    'procurement-miller.json',
    'godown-warehouse.json',
    'fps.json',
    'audit-authority.json'
  ];

  if (manifest.channel !== 'pdschannel') {
    throw new Error('Expected pdschannel in the Fabric manifest');
  }

  if (contract.channel !== manifest.channel || contract.chaincode !== 'pds-chaincode') {
    throw new Error('Fabric contract is not aligned with the manifest');
  }

  if (!compose.includes('orderer.pds.example.com') || !compose.includes('peer0.audit.example.com')) {
    throw new Error('Fabric compose scaffold is incomplete');
  }

  if (!env.includes('PDS_LEDGER_BACKEND=chaincode-runtime') || !env.includes('PDS_CHAINCODE_STATE_PATH=')) {
    throw new Error('Fabric env example is incomplete');
  }

  for (const profileFile of profileFiles) {
    const profile = JSON.parse(read(`blockchain/fabric-network/connection-profiles/${profileFile}`));
    if (!profile.channels?.pdschannel) {
      throw new Error(`Connection profile ${profileFile} is missing pdschannel`);
    }
  }

  return 'Fabric scaffold validation passed';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(validateFabricArtifacts());
}
