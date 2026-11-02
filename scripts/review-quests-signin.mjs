import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { hexToString } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const target = 'https://deploy-preview-52--topaz-yield-vacuum.netlify.app';
const load = createRequire(path.join(process.env.QUEST_BROWSER_MODULES, 'package.json'));
const { chromium } = load('playwright');
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir('quest-review', { recursive: true });
try {
  for (const [network, chain] of [['arc','0x13b2'],['robinhood','0x1237']]) {
    const account = privateKeyToAccount(generatePrivateKey());
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let signed = 0;
    const forbidden = [];
    await context.exposeBinding('__questTestSign', async (_source, hex, address) => {
      assert.equal(address.toLowerCase(), account.address.toLowerCase());
      const message = hexToString(hex);
      assert.ok(message.startsWith(new URL(target).host + ' wants you to sign in'));
      assert.ok(message.includes('URI: ' + target + '/quests'));
      assert.ok(message.includes('No token transfer or spending approval.'));
      assert.ok(message.includes('Chain ID: ' + parseInt(chain, 16)));
      signed++;
      return account.signMessage({ message });
    });
    await context.addInitScript(({ address, chain }) => {
      const listeners = new Map();
      let current = address, network = chain, reject = false;
      const emit = (event, value) => (listeners.get(event) || []).forEach(fn => fn(value));
      window.__questTestWallet = {
        rejectNext: () => { reject = true; },
        changeAccount: value => { current = value; emit('accountsChanged', [value]); },
        changeChain: value => { network = value; emit('chainChanged', value); },
      };
      window.ethereum = {
        isMetaMask: true,
        on: (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn]),
        removeListener: (name, fn) => listeners.set(name, (listeners.get(name) || []).filter(item => item !== fn)),
        request: async ({ method, params }) => {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [current];
          if (method === 'eth_chainId') return network;
          if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
          if (method === 'wallet_revokePermissions') return null;
          if (method === 'personal_sign') {
            if (reject) { reject = false; throw Object.assign(new Error('User rejected the sign-in request.'), { code: 4001 }); }
            return window.__questTestSign(params[0], current);
          }
          throw new Error('Forbidden test wallet method: ' + method);
        },
      };
    }, { address: account.address, chain });
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (['GET','HEAD'].includes(req.method())) return route.continue();
      if (url.origin === target && url.pathname === '/api/quests/session' && ['POST','DELETE'].includes(req.method())) return route.continue();
      forbidden.push(req.method() + ' ' + url.pathname);
      return route.abort();
    });
    try {
      const directory = await context.request.get(target + '/api/quests');
      assert.equal(directory.status(), 200);
      assert.equal((await directory.json()).enabled, true, 'Preview must be explicitly enabled before the authentication test');
      const page = await context.newPage();
      page.setDefaultTimeout(25000);
      await page.goto(target + '/quests', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /CONNECT WALLET/ }).waitFor();
      await page.getByRole('button', { name: /CONNECT WALLET/ }).click();
      await page.getByRole('dialog', { name: 'Wallet connection' }).getByRole('button', { name: /MetaMask/ }).click();
      const signIn = page.getByRole('button', { name: 'Verify wallet & sign in', exact: true });
      await signIn.waitFor();
      await page.evaluate(() => window.__questTestWallet.rejectNext());
      await signIn.click();
      await page.getByRole('alert').filter({ hasText: /rejected/i }).waitFor();
      assert.equal((await (await context.request.get(target + '/api/quests/session')).json()).authenticated, false);
      await signIn.click();
      await page.getByRole('button', { name: 'Sign out of Quests', exact: true }).waitFor();
      const session = await (await context.request.get(target + '/api/quests/session')).json();
      assert.equal(session.authenticated, true);
      assert.equal(session.identity.wallet, account.address.toLowerCase());
      assert.equal(session.identity.network, network);
      assert.equal(session.identity.admin, false);
      const cookies = await context.cookies(target);
      const auth = cookies.find(cookie => cookie.name === '__Host-mss2-quest-session');
      assert.ok(auth?.secure && auth.httpOnly && auth.sameSite === 'Strict');
      const profile = await context.request.get(target + '/api/quests/profile');
      assert.equal(profile.status(), 200);
      assert.equal((await profile.json()).totalPoints, 0);
      assert.equal((await context.request.get(target + '/api/quests/admin')).status(), 403);
      // Check CSRF rejection directly; this does not submit tasks or create campaigns.
      assert.equal((await context.request.delete(target + '/api/quests/session', { headers: { Origin: target } })).status(), 403);
      const other = await context.newPage();
      await other.goto(target + '/quests/profile', { waitUntil: 'domcontentloaded' });
      await other.getByRole('button', { name: 'Sign out of Quests', exact: true }).waitFor();
      await other.getByRole('button', { name: 'Sign out of Quests', exact: true }).click();
      await other.getByText('Quest session signed out.', { exact: true }).waitFor();
      assert.equal((await context.request.get(target + '/api/quests/profile')).status(), 401);
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await signIn.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Sign out of Quests', exact: true }).count(), 0);
      assert.equal(signed, 1);
      assert.deepEqual(forbidden, []);
      results.push({ network, passed: true, signedMessages: signed, walletProvider: 'Instrumented EIP-1193 provider; real disposable EOA signature verified by hosted server', cancellation: true, cookieFlags: true, privateProfile: true, adminAccessDenied: true, csrfRejected: true, crossTabServerLogout: true, explicitRefreshClearsUi: true, tokenTransactions: 0 });
      console.log('PASS HOSTED SIGN-IN', network);
    } catch (error) {
      results.push({ network, passed: false, error: error.message });
      console.log('FAIL HOSTED SIGN-IN', network, error.message);
    } finally {
      // Best-effort revoke this test-only session. Never retain cookies, signatures, or keys in artifacts.
      try {
        const session = await (await context.request.get(target + '/api/quests/session')).json();
        if (session.identity?.csrf) await context.request.delete(target + '/api/quests/session', { headers: { Origin: target, 'X-Quest-CSRF': session.identity.csrf } });
      } catch { /* Server sessions also expire after 15 minutes. */ }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile('quest-review/hosted-signin-results.json', JSON.stringify({ target, checkedAt: new Date().toISOString(), results, limitations: 'No administrator signature, campaign publication, real wallet extension/device, or Topaz ID login. No funds or private keys from the site owner.' }, null, 2));
  if (results.length !== 2 || results.some(r => !r.passed)) process.exitCode = 1;
}
