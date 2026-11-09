/** Read-only discovery. This script cannot approve, sign, transfer, swap or stake. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SENDER = '0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7';
export const MSS2 = '0x091F0c7e675A787A4018eb47c30BeD3FA2013B65';
export const NETWORKS = Object.freeze({
  robinhood: {
    chainId: 4663, gas: 'ETH', rpcEnv: 'DAILY_DRAW_ROBINHOOD_READ_RPC',
    publicRpc: 'https://rpc.mainnet.chain.robinhood.com',
    payment: { symbol: 'USDG', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', expectedDecimals: null },
    sources: ['https://docs.robinhood.com/chain/contracts/', 'https://docs.paxos.com/guides/stablecoin/usdg/mainnet'],
  },
  arc: {
    chainId: 5042, gas: 'USDC', rpcEnv: 'DAILY_DRAW_ARC_READ_RPC',
    publicRpc: 'https://rpc.mainnet.arc.io',
    payment: { symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', expectedDecimals: 6 },
    sources: ['https://developers.circle.com/stablecoins/usdc-contract-addresses', 'https://docs.arc.io/arc/references/connect-to-arc'],
  },
});
const METHODS = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getStorageAt']);
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
class ReadError extends Error {}
const fail = message => { throw new ReadError(message); };
const address = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const quantity = value => typeof value === 'string' && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);

export function decodeUint(value) {
  if (!hash(value)) fail('Invalid ABI uint256 response.');
  return BigInt(value);
}
export function decodeSymbol(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value) || value.length > 8194) fail('Invalid symbol response.');
  const data = Buffer.from(value.slice(2), 'hex');
  let content;
  if (data.length === 32) content = data.subarray(0, data.indexOf(0) < 0 ? 32 : data.indexOf(0));
  else {
    if (data.length < 96 || data.length % 32 || decodeUint('0x' + data.subarray(0, 32).toString('hex')) !== 32n) fail('Invalid symbol ABI offset.');
    const length = decodeUint('0x' + data.subarray(32, 64).toString('hex'));
    if (length < 1n || length > 64n || 64n + length > BigInt(data.length)) fail('Invalid symbol ABI length.');
    content = data.subarray(64, 64 + Number(length));
  }
  const symbol = content.toString('utf8');
  if (!/^[A-Za-z0-9._ -]{1,64}$/.test(symbol)) fail('Invalid symbol characters.');
  return symbol;
}
export function makeRpc(endpoint, fetcher = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) fail('Use an HTTPS RPC without URL user-info credentials.');
  let id = 0;
  return async (method, params) => {
    if (!METHODS.has(method)) fail('RPC method is not on the read-only allowlist.');
    const requestId = ++id;
    let response, body;
    try {
      response = await fetcher(url.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!response.ok) fail('RPC HTTP request failed.');
      body = await response.json();
    } catch (error) {
      if (error instanceof ReadError) throw error;
      fail('RPC transport or JSON decoding failed; endpoint details withheld.');
    }
    if (!body || body.jsonrpc !== '2.0' || body.id !== requestId || body.error || !Object.hasOwn(body, 'result') || body.result === null) fail('Invalid or unsuccessful JSON-RPC response.');
    return body.result;
  };
}
function codeSummary(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) fail('Invalid bytecode response.');
  const bytes = Buffer.from(value.slice(2), 'hex');
  return { byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function checkBlock(value) {
  if (!value || !quantity(value.number) || !hash(value.hash)) fail('Invalid block anchor.');
  return { number: value.number, hash: value.hash.toLowerCase() };
}
export async function inspectNetwork(network, rpc) {
  const result = {
    expectedChainId: network.chainId, expectedPayment: network.payment,
    sender: SENDER, status: 'blocked', livePaymentEnabled: false,
    proofScope: 'Read-only token metadata and code observation, NOT swap, payout, ownership or randomness verification.',
    checks: [],
  };
  try {
    const chain = await rpc('eth_chainId', []);
    if (!quantity(chain) || BigInt(chain) !== BigInt(network.chainId)) fail('RPC chain ID does not match the selected network.');
    const anchor = checkBlock(await rpc('eth_getBlockByNumber', ['latest', false]));
    result.anchor = anchor;
    result.finality = 'Latest block observation; no finality guarantee.';
    for (const asset of [network.payment, { symbol: 'MSS2', address: MSS2, expectedDecimals: 18 }]) {
      if (!address(asset.address)) fail('Invalid configured token address.');
      const code = codeSummary(await rpc('eth_getCode', [asset.address, anchor.number]));
      // Arc's system-token interface may not expose ordinary EVM bytecode.
      const arcSystem = network.chainId === 5042 && asset.address.toLowerCase() === NETWORKS.arc.payment.address.toLowerCase();
      if (!code.byteLength && !arcSystem) fail('Configured token has no bytecode at the anchor block.');
      const decimals = decodeUint(await rpc('eth_call', [{ to: asset.address, data: '0x313ce567' }, anchor.number]));
      if (decimals > 255n) fail('Token decimals are outside uint8 range.');
      if (asset.expectedDecimals !== null && decimals !== BigInt(asset.expectedDecimals)) fail('Token decimals differ from the documented expectation.');
      const observedSymbol = decodeSymbol(await rpc('eth_call', [{ to: asset.address, data: '0x95d89b41' }, anchor.number]));
      const slot = await rpc('eth_getStorageAt', [asset.address, IMPLEMENTATION_SLOT, anchor.number]);
      if (!hash(slot)) fail('Invalid ERC-1967 storage observation.');
      const implementation = BigInt(slot) === 0n ? null : '0x' + slot.slice(-40);
      result.checks.push({
        address: asset.address, label: asset.symbol, observedSymbol, observedDecimals: Number(decimals), code,
        erc1967ImplementationCandidate: implementation,
        note: implementation ? 'Nonzero slot is a candidate only; proxy behavior and source matching need verification.' : 'Zero implementation slot does not rule out other proxy patterns.',
        ...(arcSystem && !code.byteLength ? { nativeInterfaceWarning: 'System interface responded without EVM code; independent verification is still required.' } : {}),
      });
    }
    result.senderCode = codeSummary(await rpc('eth_getCode', [SENDER, anchor.number]));
    result.senderControl = 'Not checked. Code presence/absence is not proof of control or a complete account-type determination.';
    const after = checkBlock(await rpc('eth_getBlockByNumber', [anchor.number, false]));
    const endingChain = await rpc('eth_chainId', []);
    if (after.number !== anchor.number || after.hash !== anchor.hash || !quantity(endingChain) || BigInt(endingChain) !== BigInt(network.chainId)) fail('Anchor or chain changed during reads; discard this snapshot.');
    result.status = 'metadata_observed';
  } catch (error) {
    result.error = error instanceof ReadError ? error.message : 'Read failed; no completed live verification is claimed.';
    result.partialObservationsOnly = true;
  }
  result.remaining = ['verified token/source/proxy review', 'MSS2 staking target and gift ABI', 'executable swap route and no-real-funds rehearsal', 'actual stake-credit rehearsal', 'randomness deployment verification', 'wallet signing authority', 'approved economics, eligibility and shortfall rules'];
  return result;
}
export async function main() {
  const report = { createdAt: new Date().toISOString(), livePaymentEnabled: false, networks: {} };
  for (const [key, config] of Object.entries(NETWORKS)) {
    try {
      report.networks[key] = await inspectNetwork(config, makeRpc(process.env[config.rpcEnv] || config.publicRpc));
    } catch { report.networks[key] = { status: 'blocked', livePaymentEnabled: false, error: 'Invalid RPC configuration; endpoint details withheld.' }; }
  }
  const output = JSON.stringify(report, null, 2) + '\n';
  if (process.argv[2]) await writeFile(process.argv[2], output, { mode: 0o600 });
  else process.stdout.write(output);
  if (Object.values(report.networks).some(value => value.status !== 'metadata_observed')) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('Read-only report failed; no transaction was submitted.'); process.exitCode = 1; });
