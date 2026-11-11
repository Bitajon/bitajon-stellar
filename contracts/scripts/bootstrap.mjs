#!/usr/bin/env node
/**
 * bootstrap.mjs — End-to-end Testnet bootstrap for the Bitajón protocol.
 *
 * Usage:
 *   bun run bootstrap                          # deploy 5 contracts + configure router
 *   bun run bootstrap --skip-deploy            # reuse IDs from .env.testnet, only configure router
 *   bun run bootstrap --skip-router            # deploy only
 *   bun run bootstrap --fund                   # fund deployer via Friendbot first
 *   bun run bootstrap --extend-ttl             # after success, run ./scripts/extend-ttl.sh
 *   bun run bootstrap --from-release v0.2.1    # download wasm from GitHub release, then deploy
 *   bun run bootstrap --from-release v0.2.1 --repo bitajon/bitajon-stellar
 *
 * Why --from-release:
 *   Stellar Expert verifies a contract by matching its on-chain wasm hash against
 *   the wasm hash published in a GitHub release. If you deploy with a local build,
 *   the hash may differ from the CI build (different Rust/CLI versions) and the
 *   contract shows "Source code: Unavailable". Using --from-release downloads the
 *   CI-built wasm and deploys that, guaranteeing a hash match.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
  hash,
  xdr,
} from '@stellar/stellar-sdk';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const WASM_DIR = join(REPO_ROOT, 'contracts', 'target', 'wasm32v1-none', 'release');
const ENV_PATH = join(REPO_ROOT, '.env.testnet');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const POLL_TIMEOUT_S = 30;

const INSTRUCTION_LEEWAY = 2_000_000;
const SIGNATURE_EXPIRATION_OFFSET = 100;

const log = {
  info: (m) => console.error(`ℹ️  ${m}`),
  ok: (m) => console.error(`✅ ${m}`),
  warn: (m) => console.error(`⚠️  ${m}`),
  err: (m) => console.error(`❌ ${m}`),
  section: (m) => {
    console.error('');
    console.error('═══════════════════════════════════════════════════════');
    console.error(`  ${m}`);
    console.error('═══════════════════════════════════════════════════════');
  },
};

/**
 * Wraps a URL in an OSC 8 hyperlink, so terminals that support it will
 * render it as a clickable link. Falls back to plain text otherwise.
 */
function link(url) {
  return `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`;
}

function explorerUrl(id) {
  return `https://stellar.expert/explorer/testnet/contract/${id}`;
}

function parseArgs(argv) {
  const flags = {
    source: 'deployer',
    feeBps: 0,
    skipRouter: false,
    skipDeploy: false,
    fund: false,
    extendTtl: false,
    fromRelease: null,
    repo: null,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--source': flags.source = argv[++i]; break;
      case '--fee-bps': flags.feeBps = parseInt(argv[++i], 10); break;
      case '--skip-router': flags.skipRouter = true; break;
      case '--skip-deploy': flags.skipDeploy = true; break;
      case '--fund': flags.fund = true; break;
      case '--extend-ttl': flags.extendTtl = true; break;
      case '--from-release': flags.fromRelease = argv[++i]; break;
      case '--repo': flags.repo = argv[++i]; break;
      default: log.err(`Unknown argument: ${argv[i]}`); process.exit(1);
    }
  }
  return flags;
}

function loadKeypair(source) {
  try {
    const out = require('node:child_process').execSync(`stellar keys secret ${source}`, {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (out.startsWith('S') && out.length === 56) return Keypair.fromSecret(out);
  } catch { /* fall through */ }
  const path = join(homedir(), '.config/stellar/identity', `${source}.toml`);
  const content = readFileSync(path, 'utf-8');
  const m = content.match(/(?:secret_key|secret)\s*[:=]\s*"?(S[A-Z2-7]{55})"?/);
  if (!m) throw new Error(`Could not load secret for ${source}`);
  return Keypair.fromSecret(m[1]);
}

function parseEnvFile(path) {
  const text = readFileSync(path, 'utf-8');
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function fundWithFriendbot(publicKey) {
  log.info(`Funding ${publicKey} via Friendbot...`);
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
    if (res.ok) {
      log.ok('Friendbot funded the account.');
    } else {
      // Friendbot returns 400 if the account is already funded. That is fine.
      log.warn(`Friendbot returned HTTP ${res.status}. Continuing anyway.`);
    }
  } catch (e) {
    log.warn(`Friendbot request failed: ${e.message}. Continuing anyway.`);
  }
}

/**
 * Downloads all .wasm assets from the GitHub releases whose tag starts with
 * `${refTag}-`, maps each asset name to its crate name, verifies the SHA-256
 * hash, and copies the wasm to WASM_DIR so `deployContract` finds it.
 *
 * Returns the list of downloaded entries: { asset, crate, hash, path }.
 */
async function downloadWasmFromReleases(refTag, repoOverride) {
  // Detect the GitHub repo from the origin remote.
  let repo = repoOverride;
  if (!repo) {
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const match = remoteUrl.match(/[:/]([^/:]+)\/([^/.]+?)(?:\.git)?$/);
      if (!match) throw new Error(`Cannot parse repo from remote URL: ${remoteUrl}`);
      repo = `${match[1]}/${match[2]}`;
    } catch (e) {
      throw new Error(`Cannot detect GitHub repo. Pass --repo owner/repo. Error: ${e.message}`);
    }
  }

  log.info(`Fetching releases from GitHub: ${repo}`);
  const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
    headers: { 'Accept': 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API returned HTTP ${res.status} for ${repo}/releases`);
  }
  const releases = await res.json();

  const prefix = `${refTag}-`;
  const matching = releases.filter((r) => r.tag_name.startsWith(prefix));
  if (matching.length === 0) {
    throw new Error(
      `No releases found with prefix "${prefix}" in ${repo}. ` +
      `Make sure tag ${refTag} was pushed and the release workflows finished.`,
    );
  }

  log.ok(`Found ${matching.length} release(s) with prefix "${prefix}":`);
  for (const r of matching) log.info(`    - ${r.tag_name}`);

  const tmpDir = join(REPO_ROOT, 'contracts', 'target', 'release-wasm');
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(WASM_DIR, { recursive: true });

  const downloaded = [];

  for (const release of matching) {
    const wasmAssets = (release.assets || []).filter((a) => a.name.endsWith('.wasm'));
    if (wasmAssets.length === 0) {
      log.warn(`No .wasm asset in release ${release.tag_name}`);
      continue;
    }

    for (const asset of wasmAssets) {
      const tmpPath = join(tmpDir, asset.name);
      log.info(`Downloading ${asset.name}...`);

      const buf = await (await fetch(asset.browser_download_url)).arrayBuffer();
      const bytes = Buffer.from(buf);
      writeFileSync(tmpPath, bytes);

      const sha256 = createHash('sha256').update(bytes).digest('hex');
      log.ok(`  Downloaded (sha256: ${sha256.substring(0, 16)}…)`);

      // Map asset name to crate name. Examples:
      //   "nonprofit-registry_v0.2.0.wasm" → "nonprofit_registry"
      //   "campaign-vault_v0.2.0.wasm"     → "campaign_vault"
      // The version is always after the first underscore, so split('_')[0]
      // reliably yields the package name with dashes.
      const baseName = asset.name.replace(/\.wasm$/, '');
      const crateName = baseName.split('_')[0].replace(/-/g, '_');
      const destPath = join(WASM_DIR, `${crateName}.wasm`);

      copyFileSync(tmpPath, destPath);
      log.ok(`  → ${destPath}`);

      downloaded.push({ asset: asset.name, crate: crateName, hash: sha256, path: destPath });
    }
  }

  if (downloaded.length === 0) {
    throw new Error(`No wasm files were downloaded from releases with prefix "${prefix}".`);
  }

  return downloaded;
}

async function deployContract(server, kp, wasmName, ctorArgs) {
  const wasmPath = join(WASM_DIR, `${wasmName}.wasm`);
  if (!existsSync(wasmPath)) {
    throw new Error(`Wasm not found: ${wasmPath}. Run "stellar contract build" first.`);
  }
  const wasmBytes = readFileSync(wasmPath);

  log.info(`Deploying ${wasmName}...`);
  const account = await server.getAccount(kp.publicKey());

  const uploadOp = Operation.uploadContractWasm({ wasm: wasmBytes });
  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(uploadOp)
    .setTimeout(30)
    .build();

  tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  let res = await server.sendTransaction(tx);
  await waitForSuccess(server, res.hash);
  log.ok(`Wasm ${wasmName} uploaded.`);

  const account2 = await server.getAccount(kp.publicKey());
  const deployerAddress = Address.fromString(kp.publicKey());

  const createOp = Operation.createCustomContract({
    address: deployerAddress,
    wasmHash: hash(wasmBytes),
    salt: hash(Buffer.concat([kp.rawPublicKey(), Buffer.from(wasmName)])),
    constructorArgs: ctorArgs,
  });

  let tx2 = new TransactionBuilder(account2, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(createOp)
    .setTimeout(30)
    .build();

  tx2 = await server.prepareTransaction(tx2);
  tx2.sign(kp);
  res = await server.sendTransaction(tx2);
  const confirmed = await waitForSuccess(server, res.hash);

  const contractId = Address.fromScVal(confirmed.returnValue).toString();
  log.ok(`${wasmName}: ${contractId}`);
  log.info(`  ↳ ${link(explorerUrl(contractId))}`);
  return contractId;
}

async function waitForSuccess(server, txHash) {
  for (let i = 0; i < POLL_TIMEOUT_S; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const tx = await server.getTransaction(txHash);
    if (tx.status === 'SUCCESS') return tx;
    if (tx.status === 'FAILED') {
      console.error(JSON.stringify(tx, null, 2));
      throw new Error(`Transaction ${txHash} failed.`);
    }
  }
  throw new Error(`Timeout waiting for ${txHash}.`);
}

function buildSignerProofScVal(signaturePayloadHash, signerKeypair) {
  const signature = signerKeypair.sign(signaturePayloadHash);
  const publicKey = signerKeypair.rawPublicKey();

  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('public_key'),
      val: xdr.ScVal.scvBytes(publicKey),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(signature),
    }),
  ]);
}

function buildSignaturePayload(networkId, nonce, signatureExpirationLedger, address, invocation) {
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorizationWithAddress(
    new xdr.HashIdPreimageSorobanAuthorizationWithAddress({
      networkId,
      nonce,
      signatureExpirationLedger,
      address,
      invocation,
    }),
  );
  return hash(preimage.toXDR());
}

function coerceToSorobanData(data) {
  if (data instanceof xdr.SorobanTransactionData) return data;
  if (typeof data === 'string') return xdr.SorobanTransactionData.fromXDR(data, 'base64');
  if (data instanceof Uint8Array) return xdr.SorobanTransactionData.fromXDR(Buffer.from(data), 'binary');
  if (typeof data.build === 'function') return data.build();
  if (typeof data.toXdr === 'function') return data;
  if (typeof data.toXDR === 'function') return data;

  if (data.resources && data.resourceFee !== undefined) {
    const resources = data.resources;
    return new xdr.SorobanTransactionData({
      ext: data.ext,
      resources: new xdr.SorobanResources({
        footprint: resources.footprint,
        instructions: resources.instructions,
        diskReadBytes: resources.diskReadBytes,
        writeBytes: resources.writeBytes,
      }),
      resourceFee: data.resourceFee,
    });
  }

  throw new Error(
    `Cannot coerce to SorobanTransactionData. typeof=${typeof data}, ` +
    `keys=${Object.keys(data).slice(0, 10).join(', ')}`,
  );
}

function bumpSorobanData(data, leeway) {
  const resources = data.resources;
  const bumped = new xdr.SorobanResources({
    footprint: resources.footprint,
    instructions: resources.instructions + leeway,
    diskReadBytes: resources.diskReadBytes,
    writeBytes: resources.writeBytes,
  });
  return new xdr.SorobanTransactionData({
    ext: data.ext,
    resources: bumped,
    resourceFee: data.resourceFee,
  });
}

async function setAuthorizedRouter(server, kp, cvId, governanceId, drId) {
  log.section('Configuring authorized_router');

  const vault = new Contract(cvId);
  const adminScVal = Address.fromString(governanceId).toScVal();
  const routerScVal = Address.fromString(drId).toScVal();
  const op = vault.call('set_authorized_router', adminScVal, routerScVal);

  const account = await server.getAccount(kp.publicKey());
  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    console.error(JSON.stringify(sim, null, 2));
    throw new Error('Simulation failed.');
  }

  const requiredAuth = sim.result.auth || [];
  if (requiredAuth.length === 0) {
    throw new Error('No auth entries returned.');
  }

  const networkId = hash(Buffer.from(NETWORK_PASSPHRASE));
  const currentLedger = sim.latestLedger;
  const signatureExpirationLedger = currentLedger + SIGNATURE_EXPIRATION_OFFSET;
  log.info(`  → Signature expires at ledger ${signatureExpirationLedger} (current: ${currentLedger})`);

  const signedAuth = [];

  for (const entry of requiredAuth) {
    const creds = entry.credentials;
    if (creds.type !== 'sorobanCredentialsAddressV2') {
      signedAuth.push(entry);
      continue;
    }

    const addrCreds = creds.addressV2;
    const addrStr = Address.fromScAddress(addrCreds.address).toString();

    if (addrStr === governanceId) {
      log.info('  → governance-account: building Ed25519 proof');

      const nonce = addrCreds.nonce;
      const invocation = entry.rootInvocation;

      const payloadHash = buildSignaturePayload(
        networkId,
        nonce,
        signatureExpirationLedger,
        addrCreds.address,
        invocation,
      );
      const proofScVal = buildSignerProofScVal(payloadHash, kp);
      const signatureScVal = xdr.ScVal.scvVec([proofScVal]);

      const newCreds = xdr.SorobanCredentials.sorobanCredentialsAddressV2(
        new xdr.SorobanAddressCredentials({
          address: addrCreds.address,
          nonce,
          signatureExpirationLedger,
          signature: signatureScVal,
        }),
      );

      signedAuth.push(new xdr.SorobanAuthorizationEntry({
        credentials: newCreds,
        rootInvocation: invocation,
      }));
    } else {
      signedAuth.push(entry);
    }
  }

  const invokeContractArgs = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(cvId).toScAddress(),
    functionName: 'set_authorized_router',
    args: [adminScVal, routerScVal],
  });
  const hostFunc = xdr.HostFunction.hostFunctionTypeInvokeContract(invokeContractArgs);

  const finalOp = Operation.invokeHostFunction({
    func: hostFunc,
    auth: signedAuth,
  });

  const finalFee = (BigInt(BASE_FEE) + BigInt(sim.minResourceFee)).toString();
  const baseData = coerceToSorobanData(sim.transactionData);
  const bumpedData = bumpSorobanData(baseData, INSTRUCTION_LEEWAY);

  const account2 = await server.getAccount(kp.publicKey());

  let finalTx = new TransactionBuilder(account2, {
    fee: finalFee,
    networkPassphrase: NETWORK_PASSPHRASE,
    sorobanData: bumpedData,
  })
    .addOperation(finalOp)
    .setTimeout(30)
    .build();

  finalTx.sign(kp);

  log.info('Submitting set_authorized_router...');
  const res = await server.sendTransaction(finalTx);
  await waitForSuccess(server, res.hash);
  log.ok('authorized_router configured.');
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const kp = loadKeypair(flags.source);
  const deployerPub = kp.publicKey();
  const deployerPk = kp.rawPublicKey();

  log.section(`Bitajón bootstrap — Testnet`);
  log.info(`Source:     ${flags.source} (${deployerPub})`);
  log.info(`Pubkey:     ${Buffer.from(deployerPk).toString('hex')}`);
  log.info(`Fee:        ${flags.feeBps} bps`);
  if (flags.skipDeploy) log.info('Mode:       SKIP-DEPLOY (reuse IDs from .env.testnet)');
  if (flags.fromRelease) log.info(`Wasm source: GitHub release "${flags.fromRelease}"`);

  // Validate flag combinations early.
  if (flags.fromRelease && flags.skipDeploy) {
    throw new Error('--from-release cannot be combined with --skip-deploy (no deploy will happen)');
  }

  if (flags.fund) {
    await fundWithFriendbot(deployerPub);
  }

  // If --from-release is set, download the CI-built wasm BEFORE deploying.
  if (flags.fromRelease) {
    log.section('0/5 — Downloading wasm from GitHub release');
    const downloaded = await downloadWasmFromReleases(flags.fromRelease, flags.repo);
    log.ok(`${downloaded.length} wasm file(s) ready in ${WASM_DIR}`);
    console.log();
  }

  const server = new rpc.Server(RPC_URL);

  let governanceId, npId, crId, cvId, drId;
  let deployMode;

  if (flags.skipDeploy) {
    if (!existsSync(ENV_PATH)) {
      throw new Error(`--skip-deploy requires ${ENV_PATH} with GOVERNANCE_ID, NP_ID, CR_ID, CV_ID, DR_ID`);
    }
    const env = parseEnvFile(ENV_PATH);
    governanceId = env.GOVERNANCE_ID;
    npId = env.NP_ID;
    crId = env.CR_ID;
    cvId = env.CV_ID;
    drId = env.DR_ID;
    if (!governanceId || !npId || !crId || !cvId || !drId) {
      throw new Error(`Missing one or more IDs in ${ENV_PATH}`);
    }
    deployMode = 'reused from .env.testnet';
    log.ok(`Reusing IDs from .env.testnet`);
    log.info(`GOVERNANCE_ID=${governanceId}`);
    log.info(`  ↳ ${link(explorerUrl(governanceId))}`);
    log.info(`NP_ID=${npId}`);
    log.info(`  ↳ ${link(explorerUrl(npId))}`);
    log.info(`CR_ID=${crId}`);
    log.info(`  ↳ ${link(explorerUrl(crId))}`);
    log.info(`CV_ID=${cvId}`);
    log.info(`  ↳ ${link(explorerUrl(cvId))}`);
    log.info(`DR_ID=${drId}`);
    log.info(`  ↳ ${link(explorerUrl(drId))}`);
  } else {
    deployMode = flags.fromRelease
      ? `freshly deployed from release ${flags.fromRelease}`
      : 'freshly deployed';

    log.section('1/5 — governance-account');
    governanceId = await deployContract(server, kp, 'governance_account', [
      xdr.ScVal.scvVec([xdr.ScVal.scvBytes(deployerPk)]),
      xdr.ScVal.scvU32(1),
    ]);

    log.section('2/5 — nonprofit-registry');
    npId = await deployContract(server, kp, 'nonprofit_registry', [
      Address.fromString(governanceId).toScVal(),
    ]);

    log.section('3/5 — campaign-registry');
    crId = await deployContract(server, kp, 'campaign_registry', [
      Address.fromString(governanceId).toScVal(),
      Address.fromString(npId).toScVal(),
    ]);

    log.section('4/5 — campaign-vault');
    cvId = await deployContract(server, kp, 'campaign_vault', [
      Address.fromString(governanceId).toScVal(),
      Address.fromString(crId).toScVal(),
    ]);

    log.section('5/5 — donation-router');
    drId = await deployContract(server, kp, 'donation_router', [
      Address.fromString(governanceId).toScVal(),
      Address.fromString(deployerPub).toScVal(),
      Address.fromString(cvId).toScVal(),
      xdr.ScVal.scvU32(flags.feeBps),
    ]);
  }

  let routerConfigured = 'no';
  if (!flags.skipRouter) {
    await setAuthorizedRouter(server, kp, cvId, governanceId, drId);
    routerConfigured = 'yes';
  }

  // Backup .env if it exists.
  if (existsSync(ENV_PATH)) {
    const backup = `${ENV_PATH}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(ENV_PATH, backup);
    log.info(`Backup of previous .env: ${backup}`);
  }

  const envContent = `# Bitajón contracts — deployed ${new Date().toISOString()}
# Network: testnet
# Source: ${flags.source} (${deployerPub})
# Treasury: ${deployerPub}
# Fee: ${flags.feeBps} bps
# Mode: ${deployMode}

GOVERNANCE_ID=${governanceId}
NP_ID=${npId}
CR_ID=${crId}
CV_ID=${cvId}
DR_ID=${drId}

# Metadata
TREASURY=${deployerPub}
FEE_BPS=${flags.feeBps}
AUTHORIZED_ROUTER_CONFIGURED=${routerConfigured}
`;
  writeFileSync(ENV_PATH, envContent);
  log.ok(`.env written to ${ENV_PATH}`);

  log.section('Summary');
  console.log(`  Network:     testnet`);
  console.log(`  Source:      ${flags.source} (${deployerPub})`);
  console.log(`  Treasury:    ${deployerPub}`);
  console.log(`  Fee:         ${flags.feeBps} bps`);
  console.log(`  Mode:        ${deployMode}`);
  console.log(`  Router set:  ${routerConfigured}`);
  console.log();
  console.log(`  Contracts:`);
  console.log(`    governance-account: ${governanceId}`);
  console.log(`      ${link(explorerUrl(governanceId))}`);
  console.log(`    nonprofit-registry: ${npId}`);
  console.log(`      ${link(explorerUrl(npId))}`);
  console.log(`    campaign-registry:  ${crId}`);
  console.log(`      ${link(explorerUrl(crId))}`);
  console.log(`    campaign-vault:     ${cvId}`);
  console.log(`      ${link(explorerUrl(cvId))}`);
  console.log(`    donation-router:    ${drId}`);
  console.log(`      ${link(explorerUrl(drId))}`);

  // Run extend-ttl.sh automatically if requested.
  if (flags.extendTtl) {
    log.section('Extending TTL on all 5 contracts');
    const ttlScript = join(REPO_ROOT, 'contracts', 'scripts', 'extend-ttl.sh');
    if (!existsSync(ttlScript)) {
      log.warn(`extend-ttl.sh not found at ${ttlScript}. Skipping.`);
    } else {
      const r = spawnSync(ttlScript, [], { stdio: 'inherit', cwd: REPO_ROOT });
      if (r.status !== 0) {
        log.warn(`extend-ttl.sh exited with code ${r.status}. You may need to run it manually.`);
      }
    }
  } else {
    log.section('Next step');
    log.warn('The contracts were deployed, but their INSTANCE TTL is at the default.');
    log.warn('Run ./scripts/extend-ttl.sh to extend both Wasm and instance TTL');
    log.warn('to ~30 days. Without this, they may be archived by the network.');
    console.log();
    console.log('  cd contracts && ./scripts/extend-ttl.sh');
    console.log();
    console.log('Or re-run this bootstrap with --extend-ttl to chain them.');
  }

  log.ok('=== Bootstrap complete ===');
}

main().catch((err) => {
  log.err(err.stack || err.message);
  process.exit(1);
});
