import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '@netlify/database';

/** Disposable databases only. Never accepts a hosted or production database URL. */
export async function startQuestTestDatabase() {
  const configured = process.env.MSS2_QUEST_TEST_DB_URL;
  if (configured) {
    const url = new URL(configured);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/quest_pilot_test' || url.search) throw new Error('Quest tests require a dedicated loopback quest_pilot_test database, without connection options.');
    const root = getDatabase({ connectionString: configured });
    const schema = `quest_test_${randomUUID().replaceAll('-', '')}`;
    // Schema is generated here, not supplied by a request or environment variable.
    await root.pool.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-csearch_path=${schema}`);
    const connectionString = url.toString();
    const db = getDatabase({ connectionString });
    const stop = async () => {
      await db.pool.end();
      try { await root.pool.query(`DROP SCHEMA ${schema} CASCADE`); }
      finally { await root.pool.end(); }
    };
    try {
      const directory = 'netlify/database/migrations';
      for (const name of readdirSync(directory).filter(name => /^\d+_.*\.sql$/.test(name)).sort()) {
        await db.pool.query(readFileSync(join(directory, name), 'utf8'));
      }
      return { db, connectionString, concurrentTransactions: true, stop };
    } catch (error) { await stop(); throw error; }
  }
  if (process.env.CI === 'true') throw new Error('CI must provide MSS2_QUEST_TEST_DB_URL for real multi-connection PostgreSQL tests.');
  const { NetlifyDB } = await import('@netlify/database-dev');
  const local = new NetlifyDB();
  const connectionString = await local.start();
  const db = getDatabase({ connectionString });
  // PGlite is one backend: the local-only pool must not interleave transactions.
  // CI does not use this fallback and exercises true concurrent connections.
  db.pool.options.max = 1;
  try {
    await local.applyMigrations('./netlify/database/migrations');
    return { db, connectionString, concurrentTransactions: false, stop: async () => { await db.pool.end(); await local.stop(); } };
  } catch (error) { await db.pool.end(); await local.stop(); throw error; }
}
