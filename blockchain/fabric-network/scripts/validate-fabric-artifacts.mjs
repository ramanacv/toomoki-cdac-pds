import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../../..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

/**
 * The 2 orgs actually deployed in docker-compose.fabric.yml (T3.2). The other
 * 3 orgs in organization-layout.json are documented future peers; their
 * connection profiles are validated for shape but flagged as not-yet-deployed.
 */
const DEPLOYED_PROFILES = ['food-department.json', 'godown-warehouse.json'];
const FUTURE_PROFILES = ['procurement-miller.json', 'fps.json', 'audit-authority.json'];

const warn = (message) => {
  // eslint-disable-next-line no-console
  console.warn(`[validate-fabric-artifacts] WARN: ${message}`);
};

export function validateFabricArtifacts() {
  const manifest = JSON.parse(read('blockchain/fabric-network/network-manifest.json'));
  const contract = JSON.parse(read('blockchain/fabric-network/fabric-contract.json'));
  const compose = read('blockchain/fabric-network/docker-compose.fabric.yml');
  const env = read('blockchain/fabric-network/fabric-env.example');

  if (manifest.channel !== 'pdschannel') {
    throw new Error('Expected pdschannel in the Fabric manifest');
  }

  if (contract.channel !== manifest.channel || contract.chaincode !== 'pds-chaincode') {
    throw new Error('Fabric contract is not aligned with the manifest');
  }

  if (!compose.includes('orderer.pds.example.com') || !compose.includes('peer0.godown.example.com')) {
    throw new Error('Fabric compose scaffold is incomplete');
  }

  if (!env.includes('PDS_LEDGER_MODE=') || !env.includes('PDS_CHAINCODE_STATE_PATH=')) {
    throw new Error('Fabric env example is incomplete');
  }

  // Deployed org profiles must include pdschannel AND reference a peer that is
  // actually present in the compose scaffold.
  for (const profileFile of DEPLOYED_PROFILES) {
    const profile = JSON.parse(read(`blockchain/fabric-network/connection-profiles/${profileFile}`));
    if (!profile.channels?.pdschannel) {
      throw new Error(`Connection profile ${profileFile} is missing pdschannel`);
    }
    const peerNames = Object.keys(profile.peers ?? {});
    if (peerNames.length === 0) {
      throw new Error(`Connection profile ${profileFile} has no peers`);
    }
    for (const peer of peerNames) {
      if (!compose.includes(peer)) {
        throw new Error(`Connection profile ${profileFile} references peer ${peer} not present in docker-compose.fabric.yml`);
      }
    }
  }

  // Future-org profiles are validated for shape (pdschannel present) but skipped
  // from the strict deployed-peer check, with a warning that they are not yet
  // part of the 2-org deployment.
  for (const profileFile of FUTURE_PROFILES) {
    const profile = JSON.parse(read(`blockchain/fabric-network/connection-profiles/${profileFile}`));
    if (!profile.channels?.pdschannel) {
      throw new Error(`Connection profile ${profileFile} is missing pdschannel`);
    }
    warn(`${profileFile} documents a future (not-yet-deployed) org; skipping deployed-peer check.`);
  }

  return 'Fabric scaffold validation passed';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(validateFabricArtifacts());
}
