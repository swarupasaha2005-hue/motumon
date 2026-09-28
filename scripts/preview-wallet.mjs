import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { createKeystore } from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preview');

const secretDir = path.resolve('.secrets');
const seedPath = path.join(secretDir, 'preview-wallet.seed');
await mkdir(secretDir, { recursive: true, mode: 0o700 });

let seed;
try {
  seed = (await readFile(seedPath, 'utf8')).trim();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  seed = randomBytes(32).toString('hex');
  const file = await open(seedPath, 'wx', 0o600);
  try {
    await file.writeFile(`${seed}\n`);
  } finally {
    await file.close();
  }
}

if (!/^[0-9a-f]{64}$/.test(seed)) throw new Error('Invalid local Preview seed file');
const result = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
if (result.type !== 'seedOk') throw new Error('Wallet derivation failed');
const derived = result.hdWallet.selectAccount(0).selectRole(Roles.NightExternal).deriveKeyAt(0);
if (derived.type === 'keyOutOfBounds') throw new Error('Wallet derivation failed');
result.hdWallet.clear();

const address = createKeystore(derived.key, 'preview').getBech32Address().asString();
console.log(address);
console.error(`Seed stored locally at ${seedPath} (mode 600). Back it up securely; never share or commit it.`);
