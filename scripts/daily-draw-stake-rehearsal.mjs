/** Research only. Mainnet requests are read-only. Transactions execute exclusively
 * inside an in-process Hardhat fork with no private keys and no live write provider.
 * Run from an isolated temporary directory with ethers 6.15.0 / hardhat 2.26.3.
 * Non-blob staking tests use explicit zero defaults for absent blob header fields.
 * This is an EVM state-fork model, not a validation of either network's consensus.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Interface, AbiCoder, getAddress, keccak256, toBeHex, zeroPadValue } from 'ethers';

const TOKEN = '0x091F0c7e675A787A4018eb47c30BeD3FA2013B65';
const SENDER = '0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7';
const RECIPIENT = '0x000000000000000000000000000000000da1d001';
const EMPTY = '0x000000000000000000000000000000000da1d002';
const ZERO = '0x0000000000000000000000000000000000000000';
const ONE = 10n ** 18n;
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const NETWORKS = {
  robinhood: { id: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com' },
  arc: { id: 5042, rpc: 'https://rpc.mainnet.arc.io' },
};
const READ_METHODS = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_getTransactionCount', 'eth_call', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getProof']);
const key = process.argv[2];
assert(Object.hasOwn(NETWORKS, key), 'Choose robinhood or arc explicitly');
const network = NETWORKS[key];
const report = {
  network: key, chainId: network.id, sender: SENDER, createdAt: new Date().toISOString(),
  status: 'blocked', livePaymentEnabled: false, mainnetTransactionsSubmitted: 0,
  scope: 'Isolated staking-path EVM state-fork rehearsal only. No stablecoin swap, drawing, consensus-equivalence claim, wallet-control proof, audit or release approval.',
  syntheticState: ['Native gas balance on fork only', 'Impersonation on fork only', 'Explicit capacity fixtures use verified storage layout on fork only'],
  headerCompatibility: { scope: 'Non-blob staking calls only; missing blobGasUsed/excessBlobGas default to zero for local Cancun EVM execution. Raw mainnet anchor checks are not modified.', fieldsDefaulted: [] },
  tests: [],
};
let gateway, hre, seq = 0, queue = Promise.resolve();
const readCache = new Map();
const serial = x => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
const safeError = e => String(e?.shortMessage ?? e?.message ?? 'Unknown error').slice(0, 1400);
async function getJson(url, options = {}) {
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(25000) });
    if (![429, 503].includes(response.status) || attempt === 3) break;
    const retryHeader = response.headers.get('retry-after');
    const numericWait = Number(retryHeader);
    const wait = retryHeader && Number.isFinite(numericWait) ? numericWait * 1000 : Math.max(0, Date.parse(retryHeader ?? '') - Date.now()) || 2000 * 2 ** attempt;
    await response.body?.cancel();
    if (wait > 60000) throw Error('Provider requested a long backoff; stop this bounded rehearsal');
    await delay(Math.max(1000, wait));
  }
  if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
  assert(response.body, 'Response body missing');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; assert(length <= 6000000, 'Response too large'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function upstream(method, params) {
  assert(READ_METHODS.has(method), 'Mainnet write/sign method blocked');
  const cacheable = ['eth_getCode', 'eth_getStorageAt', 'eth_getBalance', 'eth_getTransactionCount', 'eth_call'].includes(method) && /^0x[0-9a-f]+$/i.test(params.at(-1));
  const cacheKey = JSON.stringify([method, params]);
  if (cacheable && readCache.has(cacheKey)) return readCache.get(cacheKey);
  const job = queue.then(async () => {
    await delay(400);
    const id = ++seq;
    const response = await getJson(network.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    assert.equal(response.id, id); assert.equal(response.jsonrpc, '2.0');
    if (response.error) throw new Error(`Read-only RPC: ${String(response.error.message).slice(0, 700)}`);
    assert(Object.hasOwn(response, 'result')); return response.result;
  });
  queue = job.catch(() => {});
  if (cacheable) readCache.set(cacheKey, job);
  try { return await job; } catch (e) { readCache.delete(cacheKey); throw e; }
}
async function source(chainId, address) {
  const a = getAddress(address), file = `source-${chainId}-${a}.json`;
  let value;
  try { value = JSON.parse(await readFile(file, 'utf8')); }
  catch {
    value = await getJson(`https://sourcify.dev/server/v2/contract/${chainId}/${a}?fields=abi,compilation,runtimeBytecode,sources,storageLayout`, { headers: { 'User-Agent': 'YieldVacuum-Fork-Research/1.0 (+https://github.com/TheCryptoArborist/yield-vaccum)' } });
    await writeFile(file, serial(value));
  }
  assert.equal(String(value.chainId), String(chainId)); assert.equal(getAddress(value.address), a);
  assert.equal(value.runtimeMatch, 'exact_match'); assert(Array.isArray(value.abi));
  return value;
}
async function matchRuntime(address, record, block) {
  const code = await upstream('eth_getCode', [address, block]);
  assert(code !== '0x'); assert.equal(code.toLowerCase(), record.runtimeBytecode.onchainBytecode.toLowerCase(), 'Verified record and live runtime differ');
  return { address, keccak256: keccak256(code), bytes: (code.length - 2) / 2, matchedSourceRecordChain: record.chainId };
}
async function startReadOnlyGateway() {
  let blocked = 0, forwarded = 0;
  gateway = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    try {
      assert.equal(request.method, 'POST'); let text = '';
      for await (const chunk of request) { text += chunk; assert(text.length < 200000, 'Request too large'); }
      const body = JSON.parse(text), requests = Array.isArray(body) ? body : [body];
      assert(requests.length <= 100, 'Batch too large');
      const values = [];
      for (const entry of requests) {
        if (!READ_METHODS.has(entry.method)) { blocked++; values.push({ jsonrpc: '2.0', id: entry.id, error: { code: -32601, message: 'Upstream writes and signing are forbidden' } }); continue; }
        forwarded++;
        try {
          let result = await upstream(entry.method, entry.params ?? []);
          if (['eth_getBlockByNumber', 'eth_getBlockByHash'].includes(entry.method) && result && typeof result === 'object') {
            result = { ...result };
            for (const field of ['blobGasUsed', 'excessBlobGas']) if (result[field] == null) {
              result[field] = '0x0';
              if (!report.headerCompatibility.fieldsDefaulted.includes(field)) report.headerCompatibility.fieldsDefaulted.push(field);
            }
          }
          values.push({ jsonrpc: '2.0', id: entry.id, result });
        }
        catch (e) { values.push({ jsonrpc: '2.0', id: entry.id, error: { code: -32000, message: safeError(e) } }); }
      }
      response.end(JSON.stringify(Array.isArray(body) ? values : values[0]));
    } catch { response.statusCode = 400; response.end('{"error":"Rejected gateway request"}'); }
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${gateway.address().port}`;
  const before = forwarded;
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'wallet_sendCalls']) {
    const response = await getJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }) });
    assert.equal(response.error.code, -32601);
  }
  assert.equal(forwarded, before); assert.equal(blocked, 5);
  report.gateway = { deniedWriteMethodChecks: 5, writeRequestsForwarded: 0 };
  return endpoint;
}
const local = async (method, params = []) => {
  assert(hre && hre.network.name === 'hardhat', 'Only the in-process Hardhat provider may execute local writes');
  return hre.network.provider.request({ method, params });
};
async function main() {
  assert.equal(BigInt(await upstream('eth_chainId', [])), BigInt(network.id));
  const anchor = await upstream('eth_getBlockByNumber', ['latest', false]);
  report.anchor = { number: anchor.number, hash: anchor.hash, finalized: false };
  const tokenSource = await source(network.id, TOKEN), tokenAbi = new Interface(tokenSource.abi);
  assert.equal(tokenAbi.getFunction('airdropStake').format('sighash'), 'airdropStake(address[],uint256[])');
  report.token = await matchRuntime(TOKEN, tokenSource, anchor.number);
  const staking = getAddress(tokenAbi.decodeFunctionResult('staking', await upstream('eth_call', [{ to: TOKEN, data: tokenAbi.encodeFunctionData('staking', []) }, anchor.number]))[0]);
  const slot = await upstream('eth_getStorageAt', [staking, IMPLEMENTATION_SLOT, anchor.number]);
  assert(/^0x0{24}[0-9a-fA-F]{40}$/.test(slot) && BigInt(slot) > 0n);
  const implementation = getAddress('0x' + slot.slice(-40));
  const stakeSource = await source(network.id, implementation), stakeAbi = new Interface(stakeSource.abi);
  report.stakingProxy = staking;
  report.implementation = await matchRuntime(implementation, stakeSource, anchor.number);
  let proxySource;
  try { proxySource = await source(network.id, staking); }
  catch (e) {
    if (key !== 'arc' || e.status !== 404) throw e;
    proxySource = await source(4663, staking);
    report.proxyVerificationNote = 'Arc Sourcify proxy lookup returned 404. Its live runtime is matched byte-for-byte against the exact-verified Robinhood proxy source record. This is not a claim of an Arc Sourcify verification entry.';
  }
  report.proxy = await matchRuntime(staking, proxySource, anchor.number);
  const end = await upstream('eth_getBlockByNumber', [anchor.number, false]); assert.equal(end.hash, anchor.hash);
  // Independently compare the genuine upstream eth_call return before the local EVM model.
  const rawCall = await upstream('eth_call', [{ from: SENDER, to: TOKEN, data: tokenAbi.encodeFunctionData('airdropStake', [[RECIPIENT], [ONE]]), gas: '0x989680' }, anchor.number]);
  assert.equal(tokenAbi.decodeFunctionResult('airdropStake', rawCall)[0], ONE);
  report.mainnetEthCall = { offeredRaw: ONE, acceptedRaw: ONE, persistedState: false };
  const forkUrl = await startReadOnlyGateway();
  const config = { defaultNetwork: 'hardhat', networks: { hardhat: { chainId: network.id, hardfork: 'cancun', chains: { [network.id]: { hardforkHistory: { cancun: 0 } } }, forking: { url: forkUrl, blockNumber: Number(BigInt(anchor.number)) }, accounts: [], loggingEnabled: false } } };
  await writeFile('hardhat.config.cjs', `module.exports = ${JSON.stringify(config)};\n`);
  hre = (await import('hardhat')).default;
  assert.equal(hre.network.name, 'hardhat');
  assert.equal(BigInt(await local('eth_chainId')), BigInt(network.id));
  const call = async (address, iface, name, args = [], from) => iface.decodeFunctionResult(name, await local('eth_call', [{ to: address, data: iface.encodeFunctionData(name, args), ...(from ? { from } : {}) }, 'latest']));
  const balance = async address => (await call(TOKEN, tokenAbi, 'balanceOf', [address]))[0];
  const stake = async address => await call(staking, stakeAbi, 'stakes', [address]);
  assert.equal(getAddress((await call(staking, stakeAbi, 'token'))[0]), TOKEN);
  assert.equal((await stake(RECIPIENT))[0], 0n, 'Test recipient already has a stake');
  assert.equal(await local('eth_getCode', [RECIPIENT, 'latest']), '0x');
  assert(await balance(SENDER) >= 2n * ONE, 'Fork snapshot lacks two MSS2 for the two-gift fixture');
  assert.equal(await balance(EMPTY), 0n, 'Empty-account fixture not empty');
  const cap = (await call(staking, stakeAbi, 'stakeCap'))[0], minimum = (await call(staking, stakeAbi, 'MIN_AIRDROP_AMOUNT'))[0];
  assert.equal(minimum, ONE); report.rules = { stakeCapRaw: cap, minimumOfferRaw: minimum };
  await local('hardhat_impersonateAccount', [SENDER]);
  await local('hardhat_setBalance', [SENDER, toBeHex(100n * ONE)]);
  const send = async (recipients, amounts) => {
    const hash = await local('eth_sendTransaction', [{ from: SENDER, to: TOKEN, data: tokenAbi.encodeFunctionData('airdropStake', [recipients, amounts]), gas: '0x989680' }]);
    const receipt = await local('eth_getTransactionReceipt', [hash]); assert.equal(receipt.status, '0x1');
    return receipt;
  };
  const capture = async () => ({ sender: await balance(SENDER), proxy: await balance(staking), liquidRecipient: await balance(RECIPIENT), stake: await stake(RECIPIENT), gifted: (await call(staking, stakeAbi, 'totalGifted'))[0], total: (await call(staking, stakeAbi, 'totalStaked'))[0], referralCredit: (await call(staking, stakeAbi, 'totalReferralCredit'))[0], referrer: (await call(TOKEN, tokenAbi, 'referrerOf', [RECIPIENT]))[0], window: (await call(staking, stakeAbi, 'accrualStart', [RECIPIENT]))[0] });
  const verify = (before, after, amount, receipt) => {
    assert.equal(before.sender - after.sender, amount); assert.equal(after.proxy - before.proxy, amount);
    assert.equal(after.stake[0] - before.stake[0], amount); assert.equal(after.total - before.total, amount);
    assert.equal(after.gifted - before.gifted, amount); assert.equal(after.liquidRecipient, before.liquidRecipient);
    assert.equal(after.referrer, before.referrer); assert.equal(after.referralCredit, before.referralCredit);
    const gifts = receipt.logs.filter(l => l.address.toLowerCase() === staking.toLowerCase()).map(l => { try { return stakeAbi.parseLog(l); } catch { return null; } }).filter(l => l?.name === 'StakeGifted');
    assert.equal(gifts.length, amount > 0n ? 1 : 0);
    if (amount > 0n) { assert.equal(getAddress(gifts[0].args.sender), SENDER); assert.equal(getAddress(gifts[0].args.recipient), getAddress(RECIPIENT)); assert.equal(gifts[0].args.amount, amount); }
    const transfers = receipt.logs.filter(l => l.address.toLowerCase() === TOKEN.toLowerCase()).map(l => { try { return tokenAbi.parseLog(l); } catch { return null; } }).filter(l => l?.name === 'Transfer');
    assert.equal(transfers.length, amount > 0n ? 1 : 0);
    if (amount > 0n) { assert.equal(getAddress(transfers[0].args.from), SENDER); assert.equal(getAddress(transfers[0].args.to), staking); assert.equal(transfers[0].args.value, amount); }
  };
  async function scenario(name, fn) {
    const snapshot = await local('evm_snapshot');
    try { const details = await fn(); report.tests.push({ name, status: 'passed', ...details }); }
    catch (e) { report.tests.push({ name, status: 'failed', error: safeError(e) }); }
    finally { assert.equal(await local('evm_revert', [snapshot]), true); }
  }
  await scenario('first_stake_exact_credit_and_events_without_token_approval', async () => {
    const before = await capture(), receipt = await send([RECIPIENT], [ONE]), after = await capture();
    verify(before, after, ONE, receipt); assert(after.window > 0n);
    return { offeredRaw: ONE, stakeCreditedRaw: ONE, senderDebitRaw: ONE, beneficiaryLiquidCreditRaw: '0', localReceiptStatus: receipt.status };
  });
  await scenario('existing_stake_preserves_rewards_window_and_referral', async () => {
    await send([RECIPIENT], [ONE]); await local('evm_increaseTime', [60]); await local('evm_mine');
    const before = await capture(), receipt = await send([RECIPIENT], [ONE]), after = await capture();
    verify(before, after, ONE, receipt); assert.equal(after.window, before.window); assert(after.stake[2] > before.stake[2]);
    return { additionalStakeRaw: ONE, accrualWindowPreserved: true, earnedRewardUnitsPreserved: true };
  });
  await scenario('repeated_calldata_is_a_second_gift_not_protocol_deduplication', async () => {
    const before = await capture(); await send([RECIPIENT], [ONE]); await send([RECIPIENT], [ONE]);
    const after = await capture(); assert.equal(after.stake[0] - before.stake[0], 2n * ONE);
    return { requirement: 'The draw must prevent duplicate payout authorization and reconcile pending transactions; the token has no draw ID.' };
  });
  async function fixtureAmount(amount) {
    const layout = stakeSource.storageLayout;
    const mapping = layout.storage.find(x => x.label === 'stakes'); assert(mapping && mapping.offset === 0);
    const valueType = layout.types[layout.types[mapping.type].value];
    const member = valueType.members.find(x => x.label === 'amount'), checkpoint = valueType.members.find(x => x.label === 'checkpoint');
    assert.equal(member.offset, 0); assert.equal(checkpoint.offset, 0);
    const base = BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [RECIPIENT, BigInt(mapping.slot)])));
    const before = (await stake(RECIPIENT))[0], total = (await call(staking, stakeAbi, 'totalStaked'))[0];
    const now = BigInt((await local('eth_getBlockByNumber', ['latest', false])).timestamp);
    const put = async (slot, value) => local('hardhat_setStorageAt', [staking, toBeHex(slot), zeroPadValue(toBeHex(value), 32)]);
    await put(base + BigInt(member.slot), amount); await put(base + BigInt(checkpoint.slot), now);
    const totalSlot = layout.storage.find(x => x.label === 'totalStaked'); assert(totalSlot && totalSlot.offset === 0);
    await put(BigInt(totalSlot.slot), total + amount - before);
    const windowSlot = layout.storage.find(x => x.label === 'accrualStart'); assert(windowSlot && windowSlot.offset === 0);
    await put(BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [RECIPIENT, BigInt(windowSlot.slot)]))), now);
    assert.equal((await stake(RECIPIENT))[0], amount);
  }
  await scenario('partial_capacity_credits_only_remaining_room', async () => {
    await fixtureAmount(cap - ONE / 2n);
    const before = await capture(), receipt = await send([RECIPIENT], [ONE]), after = await capture();
    verify(before, after, ONE / 2n, receipt); assert.equal(after.stake[0], cap);
    return { syntheticCapacityFixture: true, offeredRaw: ONE, acceptedRaw: ONE / 2n, retainedBySenderRaw: ONE / 2n, fullPrizePaid: false };
  });
  await scenario('zero_capacity_success_receipt_is_not_a_paid_prize', async () => {
    await fixtureAmount(cap);
    const before = await capture(), receipt = await send([RECIPIENT], [ONE]), after = await capture();
    verify(before, after, 0n, receipt);
    return { syntheticCapacityFixture: true, offeredRaw: ONE, acceptedRaw: '0', localReceiptStatus: receipt.status, fullPrizePaid: false };
  });
  const vault = (await call(TOKEN, tokenAbi, 'liquidityVault'))[0];
  const invalid = [
    ['below_minimum', [RECIPIENT], [ONE - 1n]], ['self_gift', [SENDER], [ONE]],
    ['zero_recipient', [ZERO], [ONE]], ['token_recipient', [TOKEN], [ONE]],
    ['staking_recipient', [staking], [ONE]], ['vault_recipient', [vault], [ONE]],
    ['empty_recipients', [], []], ['array_length_mismatch', [RECIPIENT], []],
    ['duplicate_recipients', [RECIPIENT, RECIPIENT], [ONE, ONE]],
  ];
  for (const [name, recipients, amounts] of invalid) await scenario(`reject_${name}`, async () => {
    const before = await capture(); let rejected = false;
    try { await call(TOKEN, tokenAbi, 'airdropStake', [recipients, amounts], SENDER); }
    catch (e) { const data = typeof e.data === 'string' ? e.data : e.data?.data; const selector = stakeAbi.getError('InvalidRequest').selector; assert.equal(data?.slice(0, 10), selector, 'Expected contract InvalidRequest, not transport failure'); rejected = true; }
    assert(rejected); assert.deepEqual(await capture(), before);
    return { contractRevertVerified: true, stateUnchanged: true };
  });
  await scenario('insufficient_tokens_reverts_atomically', async () => {
    const before = await capture(); let rejected = false;
    try { await call(TOKEN, tokenAbi, 'airdropStake', [[RECIPIENT], [ONE]], EMPTY); }
    catch (e) { const data = typeof e.data === 'string' ? e.data : e.data?.data; assert.equal(data?.slice(0, 10), tokenAbi.getError('ERC20InsufficientBalance').selector); rejected = true; }
    assert(rejected); assert.deepEqual(await capture(), before); return { stateUnchanged: true };
  });
  await scenario('direct_staking_gift_rejects_non_token_caller', async () => {
    let rejected = false;
    try { await call(staking, stakeAbi, 'gift', [SENDER, [RECIPIENT], [ONE]], SENDER); }
    catch (e) { const data = typeof e.data === 'string' ? e.data : e.data?.data; assert.equal(data?.slice(0, 10), stakeAbi.getError('OnlyToken').selector); rejected = true; }
    assert(rejected); return { correctEntryPoint: 'MSS2 token airdropStake(address[],uint256[])' };
  });
  await local('hardhat_stopImpersonatingAccount', [SENDER]);
  const finalAnchor = await upstream('eth_getBlockByNumber', [anchor.number, false]); assert.equal(finalAnchor.hash, anchor.hash);
  report.passed = report.tests.filter(t => t.status === 'passed').length;
  report.failed = report.tests.filter(t => t.status === 'failed').length;
  report.status = report.failed === 0 ? 'fork_staking_cases_passed' : 'fork_cases_failed';
}
try { await main(); }
catch (e) { report.error = safeError(e); }
finally {
  if (gateway) { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); }
  await writeFile(`fork-staking-${key}.json`, serial(report) + '\n');
  console.log('BEGIN_FORK_STAKING_REPORT'); console.log(serial(report)); console.log('END_FORK_STAKING_REPORT');
  if (report.status !== 'fork_staking_cases_passed') process.exitCode = 1;
}
