import { getDatabase } from '@netlify/database';
let database: ReturnType<typeof getDatabase> | undefined;
export const stackDatabase = () => database ??= getDatabase({ connectionString: process.env.NETLIFY_DB_URL });
