import assert from "node:assert/strict";
import test from "node:test";
import { getDatabase } from "@netlify/database";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { trialMessage, validateTrialChallenge, type TrialChallenge } from "../lib/mint-flyer-trial";

const challenge: TrialChallenge = { wallet: "0x1234567890abcdef1234567890abcdef12345678", playerKey: "player-1234567890", runId: "flight-1234567890", network: "arc", issuedAt: 1000000 };

test("trial requests expire and reject malformed ownership context", () => {
  validateTrialChallenge(challenge, 1000000);
  for (const change of [{ issuedAt: 699999 }, { issuedAt: 1010001 }, { network: "unsupported" }, { wallet: "0x123" }, { playerKey: "short" }, { runId: "short" }]) {
    assert.throws(() => validateTrialChallenge({ ...challenge, ...change } as TrialChallenge, 1000000));
  }
});

test("wallet signature binds the site, network, player and single flight", async () => {
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const value = { ...challenge, wallet: account.address };
  const message = trialMessage(value, "yieldvaccum.xyz");
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  for (const changed of [{ ...value, network: "robinhood" as const }, { ...value, runId: "another-flight-1234" }, { ...value, playerKey: "another-player-1234" }]) {
    assert.equal(await verifyMessage({ address: account.address, message: trialMessage(changed, "yieldvaccum.xyz"), signature }), false);
  }
  assert.equal(await verifyMessage({ address: account.address, message: trialMessage(value, "other.example"), signature }), false);
});

test("database permits exactly one claim across concurrent devices and networks", async () => {
  const { NetlifyDB } = await import("@netlify/database-dev");
  const local = new NetlifyDB();
  let db: ReturnType<typeof getDatabase> | undefined;
  try {
    const connectionString = await local.start();
    await local.applyMigrations("./netlify/database/migrations");
    db = getDatabase({ connectionString });
    const sql = db.sql;
    const claims = await Promise.all(Array.from({ length: 6 }, (_, index) => sql`INSERT INTO mint_flyer_trials (wallet, player_key, run_id, network) VALUES (${challenge.wallet}, ${`player-device-${index}`}, ${`flight-device-${index}`}, ${index % 2 ? "arc" : "robinhood"}) ON CONFLICT (wallet) DO NOTHING RETURNING run_id`));
    assert.equal(claims.filter(rows => rows.length).length, 1);
    const rows = await sql`SELECT * FROM mint_flyer_trials WHERE wallet = ${challenge.wallet}`;
    assert.equal(rows.length, 1);
    await assert.rejects(async () => await sql`INSERT INTO mint_flyer_trials (wallet, player_key, run_id, network) VALUES (${challenge.wallet.toUpperCase()}, ${"another-player"}, ${"another-flight"}, ${"arc"})`);
  } finally {
    if (db) await db.pool.end();
    await local.stop();
  }
});
