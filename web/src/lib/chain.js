import probeSource from '../../../contracts/source_probe.py?raw';
import productSource from '../../../contracts/proofrelay.py?raw';
import deployment from '../../../deployment.json';

export const CHAIN_ID = 61999;
export const EXPLORER = 'https://explorer-studio.genlayer.com';
export const PRODUCT_CRITERIA_VERSION = 'proofrelay-scope-3';
export const PRODUCT_CRITERIA_HASH = 'd5a0dc03cd3b2c1fdbc2f33745346f848422ec36fd8c874e2882e08c8e7363ca';
export const PROBE_SOURCE = probeSource;
export const PRODUCT_SOURCE = productSource;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PROBE_ADDRESS_KEY = 'proofrelay:studionet:probe';
const PRODUCT_ADDRESS_KEY = 'proofrelay:studionet:product';
const PENDING_KEY = 'proofrelay:studionet:pending';
let sdkPromise;

async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import('genlayer-js'),
      import('genlayer-js/chains'),
    ]).then(([sdk, chains]) => ({ createClient: sdk.createClient, studionet: chains.studionet }));
  }
  return sdkPromise;
}

export function validAddress(value) { return ADDRESS_RE.test(value || '') && !/^0x0{40}$/i.test(value); }
export function short(value) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—'; }
export function configuredProbeAddress() {
  const fromBuild = import.meta.env.VITE_PROOFRELAY_PROBE_ADDRESS || deployment.contractAddress;
  const fromLocal = localStorage.getItem(PROBE_ADDRESS_KEY);
  return validAddress(fromBuild) ? fromBuild : validAddress(fromLocal) ? fromLocal : '';
}
export function configuredProductAddress() {
  const fromBuild = import.meta.env.VITE_PROOFRELAY_ADDRESS || deployment.productAddress;
  const fromLocal = localStorage.getItem(PRODUCT_ADDRESS_KEY);
  // The reviewed release address is authoritative. Local QA state must never
  // make a fresh release silently fall back to an older deployment.
  return validAddress(fromBuild) ? fromBuild : validAddress(fromLocal) ? fromLocal : '';
}
export function saveProbeAddress(address) {
  if (!validAddress(address)) throw new Error('The network did not return a valid contract address.');
  localStorage.setItem(PROBE_ADDRESS_KEY, address);
}
export function saveProductAddress(address) {
  if (!validAddress(address)) throw new Error('The network did not return a valid ProofRelay contract address.');
  localStorage.setItem(PRODUCT_ADDRESS_KEY, address);
}
export function pendingAction() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}
export function rememberPending(action) { localStorage.setItem(PENDING_KEY, JSON.stringify(action)); }
export function forgetPending() { localStorage.removeItem(PENDING_KEY); }
export function provider() { return window.ethereum || null; }

export async function ensureStudionet(wallet) {
  const { studionet } = await loadSdk();
  const chainHex = `0x${CHAIN_ID.toString(16)}`;
  const current = await wallet.request({ method: 'eth_chainId' });
  if (Number.parseInt(current, 16) === CHAIN_ID) return;
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (error) {
    if (error?.code !== 4902) throw new Error('Switch MetaMask to GenLayer Studionet (chain 61999).');
    await wallet.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: chainHex,
      chainName: studionet.name,
      nativeCurrency: studionet.nativeCurrency,
      rpcUrls: studionet.rpcUrls.default.http,
      blockExplorerUrls: [EXPLORER],
    }] });
  }
}

export async function requestWallet() {
  const wallet = provider();
  if (!wallet) throw new Error('MetaMask is required to sign the StudioNet probe transactions.');
  const accounts = await wallet.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!validAddress(account)) throw new Error('No wallet account was selected.');
  await ensureStudionet(wallet);
  return account;
}

export async function client(account) {
  const { createClient, studionet } = await loadSdk();
  const wallet = provider();
  return createClient({ chain: studionet, ...(account ? { account, provider: wallet } : {}) });
}

export async function deployProbe(account) {
  return (await client(account)).deployContract({ code: PROBE_SOURCE, args: [] });
}

export async function deployProduct(account) {
  return (await client(account)).deployContract({ code: PRODUCT_SOURCE, args: [] });
}

export async function inspect(address, revision, quote, account) {
  return (await client(account)).writeContract({
    address,
    functionName: 'inspect_wikipedia_snapshot',
    args: [revision, quote],
    value: 0n,
  });
}

export async function createRecord(address, claim, revision, quote, account) {
  return (await client(account)).writeContract({
    address,
    functionName: 'create_record',
    args: [claim, revision, quote],
    value: 0n,
  });
}

export async function proposeCorrection(address, recordId, revision, quote, account) {
  return (await client(account)).writeContract({
    address,
    functionName: 'propose_correction',
    args: [recordId, revision, quote],
    value: 0n,
  });
}

export async function adoptCorrection(address, proposalId, account) {
  return (await client(account)).writeContract({
    address,
    functionName: 'adopt_correction',
    args: [proposalId],
    value: 0n,
  });
}

export async function read(address, functionName, args = []) {
  if (!validAddress(address)) throw new Error('Deploy the source probe first.');
  return (await client()).readContract({ address, functionName, args });
}

export function successfulReceipt(receipt) {
  if (receipt?.statusName !== 'FINALIZED' && receipt?.status !== 7) return false;
  const executionResult = receipt?.txExecutionResultName ?? receipt?.txExecutionResult
    ?? receipt?.leader_receipt?.execution_result
    ?? receipt?.consensus_data?.leader_receipt?.[0]?.execution_result;
  // Consensus can finalize a rollback. Never infer execution success from the
  // consensus result alone when the execution result is absent.
  return ['FINISHED_WITH_RETURN', 'SUCCESS'].includes(executionResult) || executionResult === 1;
}

export async function waitForFinality(hash) {
  // Receipt polling is read-only; it must not bind the lookup to whichever
  // MetaMask account happens to be selected now, which may differ from sender.
  const receipt = await (await client())
    .waitForTransactionReceipt({ hash, status: 'FINALIZED', interval: 5000, retries: 120 });
  if (!successfulReceipt(receipt)) throw new Error('This transaction did not finalize successfully. Check its explorer entry.');
  return receipt;
}

export async function verifyProbe(address) {
  const config = await read(address, 'get_config');
  if (config?.product !== 'ProofRelay Source Probe' || config?.rules_version !== 'probe-1') {
    throw new Error('The address does not contain the expected ProofRelay source probe.');
  }
  return config;
}

export async function verifyProduct(address) {
  const config = await read(address, 'get_config');
  if (config?.product !== 'ProofRelay' || config?.criteria_version !== PRODUCT_CRITERIA_VERSION
      || config?.criteria_hash !== PRODUCT_CRITERIA_HASH) {
    throw new Error('The address does not contain the expected ProofRelay product contract.');
  }
  return config;
}

export function explorerTx(hash) { return `${EXPLORER}/tx/${hash}`; }
export function explorerAddress(address) { return `${EXPLORER}/address/${address}`; }

export function safeError(error) {
  const message = String(error?.shortMessage || error?.message || 'Unknown error');
  if (/user rejected|user denied|rejected the request/i.test(message)) return 'You cancelled the MetaMask request. No action was recorded.';
  if (/studionet|metamask|revision|quote|probe|address|finaliz|publisher|correction|stale|scope|current/i.test(message)) return message.slice(0, 260);
  return 'The wallet or network could not complete that action. Check the transaction before retrying.';
}
