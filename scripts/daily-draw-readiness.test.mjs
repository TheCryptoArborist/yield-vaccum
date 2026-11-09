import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORKS, MSS2, SENDER, decodeUint, decodeSymbol, makeRpc, inspectNetwork } from './daily-draw-readiness.mjs';
const word = n => '0x' + BigInt(n).toString(16).padStart(64, '0');
const symbol = text => word(32) + word(text.length).slice(2) + Buffer.from(text).toString('hex').padEnd(64, '0');
const block = { number: '0x123', hash: '0x' + 'ab'.repeat(32) };
function fixture(network, override) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    const custom = override?.(method, params, calls);
    if (custom !== undefined) return custom;
    if (method === 'eth_chainId') return '0x' + network.chainId.toString(16);
    if (method === 'eth_getBlockByNumber') return block;
    if (method === 'eth_getCode') return params[0] === SENDER ? '0x' : '0x60006000';
    if (method === 'eth_getStorageAt') return word(0);
    if (method === 'eth_call' && params[0].data === '0x313ce567') return word(params[0].to === MSS2 ? 18 : 6);
    if (method === 'eth_call') return symbol(params[0].to === MSS2 ? 'MSS2' : network.payment.symbol);
    throw new Error('Unexpected call');
  };
  return { rpc, calls };
}
test('uint decoding rejects missing or short words', () => {
  assert.equal(decodeUint(word(6)), 6n);
  for (const value of ['0x', '0x06', null, 'garbage']) assert.throws(() => decodeUint(value));
});
test('standard and bytes32 symbols decode', () => {
  assert.equal(decodeSymbol(symbol('USDG')), 'USDG');
  assert.equal(decodeSymbol('0x' + Buffer.from('USDC').toString('hex').padEnd(64, '0')), 'USDC');
});
test('malformed symbol offsets and payloads fail', () => {
  for (const value of ['0x', word(64) + symbol('USDG').slice(66), symbol('\u0001'), '0x123']) assert.throws(() => decodeSymbol(value));
});
test('RPC requires HTTPS and rejects user-info URLs', () => {
  assert.throws(() => makeRpc('http://example.org'));
  assert.throws(() => makeRpc('https://user:secret@example.org'));
});
test('write/sign methods are denied without a request', async () => {
  let calls = 0;
  const rpc = makeRpc('https://example.org', async () => { calls++; });
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'wallet_requestPermissions']) await assert.rejects(rpc(method, []));
  assert.equal(calls, 0);
});
test('RPC envelope and request id are checked', async () => {
  const rpc = makeRpc('https://example.org', async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 99, result: '0x1237' }) }));
  await assert.rejects(rpc('eth_chainId', []));
});
test('RPC error bodies are not successful data', async () => {
  const rpc = makeRpc('https://example.org', async () => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'private endpoint details' } }) }));
  await assert.rejects(rpc('eth_chainId', []), error => !error.message.includes('private endpoint'));
});
test('transport failures do not leak endpoint credentials', async () => {
  const rpc = makeRpc('https://example.org/secret-token', async () => { throw new Error('secret-token'); });
  await assert.rejects(rpc('eth_chainId', []), error => !error.message.includes('secret-token'));
});
for (const key of ['robinhood', 'arc']) test(`${key} reads pin state to one block and never enable payment`, async () => {
  const { rpc, calls } = fixture(NETWORKS[key]);
  const result = await inspectNetwork(NETWORKS[key], rpc);
  assert.equal(result.status, 'metadata_observed');
  assert.equal(result.livePaymentEnabled, false);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks[0].address, NETWORKS[key].payment.address);
  assert.equal(result.checks[1].observedDecimals, 18);
  for (const call of calls.filter(c => ['eth_call', 'eth_getCode', 'eth_getStorageAt'].includes(c.method))) assert.equal(call.params.at(-1), block.number);
});
test('wrong chain fails before reading assets', async () => {
  const f = fixture(NETWORKS.arc, method => method === 'eth_chainId' ? '0x1237' : undefined);
  assert.equal((await inspectNetwork(NETWORKS.arc, f.rpc)).status, 'blocked');
  assert.equal(f.calls.length, 1);
});
test('Arc USDC wrong decimals fail', async () => {
  const f = fixture(NETWORKS.arc, (method, params) => method === 'eth_call' && params[0].data === '0x313ce567' ? word(18) : undefined);
  assert.equal((await inspectNetwork(NETWORKS.arc, f.rpc)).status, 'blocked');
});
test('MSS wrong decimals fail', async () => {
  const f = fixture(NETWORKS.robinhood, (method, params) => method === 'eth_call' && params[0].to === MSS2 && params[0].data === '0x313ce567' ? word(6) : undefined);
  assert.equal((await inspectNetwork(NETWORKS.robinhood, f.rpc)).status, 'blocked');
});
test('missing ordinary token code fails', async () => {
  const f = fixture(NETWORKS.robinhood, method => method === 'eth_getCode' ? '0x' : undefined);
  assert.equal((await inspectNetwork(NETWORKS.robinhood, f.rpc)).status, 'blocked');
});
test('Arc system interface without ordinary code is flagged, not silently accepted as audited', async () => {
  const f = fixture(NETWORKS.arc, (method, params) => method === 'eth_getCode' && params[0] === NETWORKS.arc.payment.address ? '0x' : undefined);
  const result = await inspectNetwork(NETWORKS.arc, f.rpc);
  assert.equal(result.status, 'metadata_observed');
  assert.ok(result.checks[0].nativeInterfaceWarning);
  assert.equal(result.livePaymentEnabled, false);
});
test('changed block hash invalidates the snapshot', async () => {
  const f = fixture(NETWORKS.arc, (method, params) => method === 'eth_getBlockByNumber' && params[0] !== 'latest' ? { ...block, hash: '0x' + 'cd'.repeat(32) } : undefined);
  const result = await inspectNetwork(NETWORKS.arc, f.rpc);
  assert.equal(result.status, 'blocked');
  assert.equal(result.partialObservationsOnly, true);
});
test('nonzero proxy slot is a candidate, not a verification claim', async () => {
  const f = fixture(NETWORKS.robinhood, method => method === 'eth_getStorageAt' ? word(123) : undefined);
  const result = await inspectNetwork(NETWORKS.robinhood, f.rpc);
  assert.ok(result.checks[0].erc1967ImplementationCandidate);
  assert.match(result.checks[0].note, /candidate only/);
});
