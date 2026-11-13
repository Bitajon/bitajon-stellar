#!/usr/bin/env node
/**
 * Agrega una llave Ed25519 como firmante del governance-account (admin multisig).
 * Lo usa el equipo para autorizar la "cuenta del equipo" de BITAJÓN, que firma las acciones
 * de admin desde el panel web (aprobar fundaciones, pausar campañas, liberar fondos).
 *
 * Uso:
 *   node add-signer.mjs <identidad-stellar-cli> <GOVERNANCE_ID> <pubkey-hex-32-bytes>
 *   node add-signer.mjs deployer CB5EDLY... 51d430f34a2d...
 *
 * La identidad debe ser un firmante actual del governance (con threshold = 1 basta una firma).
 * La firma sigue el mismo flujo de bootstrap.mjs (envelope CAP-71, tipo 10).
 */
import { Address, BASE_FEE, Contract, Keypair, Networks, Operation, TransactionBuilder, hash, rpc, xdr } from '@stellar/stellar-sdk';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = Networks.TESTNET;
const [identity, governanceId, pubkeyHex] = process.argv.slice(2);
if (!identity || !governanceId || !/^[0-9a-f]{64}$/i.test(pubkeyHex ?? '')) {
  console.error('Uso: node add-signer.mjs <identidad> <GOVERNANCE_ID> <pubkey-hex>');
  process.exit(1);
}

function loadKeypair(source) {
  try {
    const out = execSync(`stellar keys secret ${source}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (out.startsWith('S') && out.length === 56) return Keypair.fromSecret(out);
  } catch { /* se intenta con el archivo */ }
  const content = readFileSync(join(homedir(), '.config/stellar/identity', `${source}.toml`), 'utf-8');
  const m = content.match(/(?:secret_key|secret)\s*[:=]\s*"?(S[A-Z2-7]{55})"?/);
  if (!m) throw new Error(`No se pudo leer la llave de ${source}`);
  return Keypair.fromSecret(m[1]);
}

const kp = loadKeypair(identity);
const server = new rpc.Server(RPC_URL);
const args = [xdr.ScVal.scvBytes(Buffer.from(pubkeyHex, 'hex'))];

const tx = new TransactionBuilder(await server.getAccount(kp.publicKey()), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
  .addOperation(new Contract(governanceId).call('add_signer', ...args))
  .setTimeout(30)
  .build();
const sim = await server.simulateTransaction(tx);
if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`La simulación falló: ${sim.error}`);

const networkId = hash(Buffer.from(PASSPHRASE));
const expiration = sim.latestLedger + 100;
const auth = sim.result.auth.map((entry) => {
  const creds = entry.credentials;
  if (creds.type !== 'sorobanCredentialsAddressV2') return entry;
  const a = creds.addressV2;
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
    new xdr.HashIdPreimageSorobanAuthorizationWithAddress({ networkId, nonce: a.nonce, signatureExpirationLedger: expiration, address: a.address, invocation: entry.rootInvocation }),
  );
  const payload = hash(preimage.toXDR());
  const proof = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('public_key'), val: xdr.ScVal.scvBytes(kp.rawPublicKey()) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('signature'), val: xdr.ScVal.scvBytes(kp.sign(payload)) }),
  ]);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddressV2(
      new xdr.SorobanAddressCredentials({ address: a.address, nonce: a.nonce, signatureExpirationLedger: expiration, signature: xdr.ScVal.scvVec([proof]) }),
    ),
    rootInvocation: entry.rootInvocation,
  });
});

let data = sim.transactionData;
data = typeof data.build === 'function' ? data.build() : data;
const r = data.resources;
const sorobanData = new xdr.SorobanTransactionData({
  ext: data.ext,
  resourceFee: data.resourceFee,
  resources: new xdr.SorobanResources({ footprint: r.footprint, instructions: r.instructions + 2_000_000, diskReadBytes: r.diskReadBytes, writeBytes: r.writeBytes }),
});
const func = xdr.HostFunction.hostFunctionTypeInvokeContract(
  new xdr.InvokeContractArgs({ contractAddress: Address.fromString(governanceId).toScAddress(), functionName: 'add_signer', args }),
);
const final = new TransactionBuilder(await server.getAccount(kp.publicKey()), {
  fee: (BigInt(BASE_FEE) + BigInt(sim.minResourceFee) + 200_000n).toString(),
  networkPassphrase: PASSPHRASE,
  sorobanData,
})
  .addOperation(Operation.invokeHostFunction({ func, auth }))
  .setTimeout(30)
  .build();
final.sign(kp);

const sent = await server.sendTransaction(final);
console.log(`Enviada: ${sent.hash}`);
for (let i = 0; i < 30; i++) {
  await new Promise((res) => setTimeout(res, 1000));
  const got = await server.getTransaction(sent.hash);
  if (got.status === 'SUCCESS') {
    console.log('✅ Firmante agregado.');
    process.exit(0);
  }
  if (got.status === 'FAILED') throw new Error('La transacción falló on-chain.');
}
console.log('⏳ Sigue pendiente; revisa el hash en stellar.expert.');
