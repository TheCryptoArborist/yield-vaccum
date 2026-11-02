import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// This runner never signs, submits tasks, pays, or invokes production APIs.
const target = 'https://deploy-preview-52--topaz-yield-vacuum.netlify.app';
const requireBrowser = createRequire(path.join(process.env.QUEST_BROWSER_MODULES, 'package.json'));
const { chromium } = requireBrowser('playwright');
const output = 'quest-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
async function check(name, work) {
  try { const evidence = await work(); results.push({ name, passed: true, evidence }); console.log('PASS:', name, JSON.stringify(evidence ?? {})); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log('FAIL:', name, error.message); }
}
const routes = ['/', '/quests', '/quests/profile', '/admin/quests', '/quests/mss2-first-steps', '/quests/arcade-explorer', '/quests/unknown-review-campaign', '/arcade/lobby'];
try {
  for (const width of [360, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    // The legacy homepage counts visits with POST. Block every mutation for this review.
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    for (const route of routes) {
      await check(`${width}px ${route}: renders without horizontal page overflow`, async () => {
        const errors = [];
        const onError = error => errors.push(error.message);
        page.on('pageerror', onError);
        try {
          const response = await page.goto(target + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          const status = response?.status();
          assert.equal(status, route.includes('unknown-review') ? 404 : 200);
          await page.waitForTimeout(1800);
          if (route === '/') {
            await page.locator('.splashGameChoice').last().waitFor();
            assert.equal(await page.locator('.splashGameChoice').count(), 3);
            await page.locator('.splashQuestChoice').scrollIntoViewIfNeeded();
            const bounds = await page.locator('.splashQuestChoice').boundingBox();
            assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Quests homepage card must remain reachable');
          } else {
            assert.ok(await page.locator('h1').count(), 'A page heading is required');
          }
          const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
          assert.ok(dimensions.document <= dimensions.viewport + 1, `Page overflows: ${JSON.stringify(dimensions)}`);
          assert.deepEqual(errors, [], 'Unexpected browser exception');
          // Avoid capturing production-seeded public arcade player records in artifacts.
          if (route !== '/arcade/lobby') await page.screenshot({ path: `${output}/${width}-${route.replaceAll('/', '_') || 'home'}.png`, fullPage: true, animations: 'disabled' });
          return { status, ...dimensions, runtimeErrors: errors.length };
        } finally { page.off('pageerror', onError); }
      });
    }
    if (width === 1440) {
      await check('Quest concept search, filters, and reset', async () => {
        await page.goto(target + '/quests', { waitUntil: 'domcontentloaded' });
        const directory = page.locator('section[aria-labelledby="campaign-heading"]');
        const search = directory.getByRole('searchbox');
        await search.fill('zz-no-such-quest-zz');
        await directory.getByRole('heading', { name: 'No campaigns match these filters.' }).waitFor();
        await directory.getByRole('button', { name: /Show campaign previews/ }).click();
        await directory.getByRole('button', { name: 'Live', exact: true }).click();
        await directory.getByRole('heading', { name: 'The first live campaign is still ahead.' }).waitFor();
        await directory.getByRole('button', { name: /Show campaign previews/ }).click();
        await directory.locator('select').selectOption('arc');
        await directory.getByRole('link', { name: /Preview campaign/ }).first().waitFor();
        assert.ok(await directory.getByRole('link', { name: /Preview campaign/ }).count() > 0);
        return { search: true, liveEmptyState: true, reset: true, networkFilter: true };
      });
      await check('Homepage educational launch and Quests entry remain usable', async () => {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        await page.locator('.splashTopazChoice').click();
        await page.getByRole('button', { name: 'START MISSION', exact: true }).waitFor();
        assert.equal(await page.locator('.splashScreen').count(), 0);
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        await page.locator('.splashQuestChoice').click();
        await page.waitForURL(target + '/quests');
        return { educationalLaunch: true, questNavigation: true };
      });
      await check('All existing arcade game destinations respond', async () => {
        for (const route of ['/arcade', '/arcade/mint-invaders', '/arcade/mint-stack']) {
          const response = await context.request.get(target + route);
          assert.equal(response.status(), 200, route);
        }
        return { checked: 3, paymentsAttempted: 0 };
      });
      await check('Preview availability and private API guards', async () => {
        const response = await context.request.get(target + '/api/quests');
        assert.equal(response.status(), 200);
        const directory = await response.json();
        assert.equal(typeof directory.enabled, 'boolean');
        assert.ok(response.headers()['cache-control']?.includes('no-store'));
        for (const route of ['/api/quests/profile', '/api/quests/admin']) {
          const privateResponse = await context.request.get(target + route);
          assert.equal(privateResponse.status(), directory.enabled ? 401 : 503, route);
          const body = await privateResponse.json();
          assert.equal(typeof body.error, 'string');
          assert.equal(body.wallet, undefined);
          assert.equal(body.submissions, undefined);
        }
        return { enabled: directory.enabled, publishedCampaigns: directory.campaigns.length, anonymousPrivateDataBlocked: true };
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
  const report = { target, checkedAt: new Date().toISOString(), scope: 'Read-only hosted Chromium review. No actual wallet/device sign-in or paid play. Screenshots do not imply human visual approval.', results };
  await writeFile(`${output}/browser-results.json`, JSON.stringify(report, null, 2));
  console.log('BROWSER_REVIEW_SUMMARY', JSON.stringify({ passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }));
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
