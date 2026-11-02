import { getDatabase } from '@netlify/database';
// Run manually with the intended environment's database connection. Never schedule
// against a shared URL until preview/production database isolation is verified.
if (process.env.QUEST_PRUNE_CONFIRMED !== 'true') throw new Error('Set QUEST_PRUNE_CONFIRMED=true after verifying the target database.');
const db = getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
try {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM quest_challenges WHERE expires_at < NOW() - INTERVAL '1 day'");
    await client.query("DELETE FROM quest_sessions WHERE expires_at < NOW() - INTERVAL '1 day'");
    await client.query("DELETE FROM quest_rate_limits WHERE window < NOW() - INTERVAL '1 day'");
    await client.query('COMMIT');
    console.log('Expired quest authentication/rate records pruned; participation and audit history retained.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} finally { await db.pool.end(); }
