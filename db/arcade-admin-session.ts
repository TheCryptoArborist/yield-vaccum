import { getDatabase } from '@netlify/database';
import { randomBytes } from 'node:crypto';
import { createPublicClient,http } from 'viem';
import { deploymentContext } from '../lib/deployment-context';
import { adminSignInMessage,adminTokenHash,isArcadeAdmin } from '../lib/arcade-admin-auth';
import { paymentNetworkConfig } from '../lib/mss2-payment';
let database:ReturnType<typeof getDatabase>|undefined;
export const adminDatabase=()=>database??=getDatabase({connectionString:process.env.NETLIFY_DB_URL});
type Challenge={wallet:string;network:'arc'|'robinhood';nonce:string;origin:string;expiresAt:string};
export async function createAdminChallenge(wallet:string,network:string,origin:string,db=adminDatabase()):Promise<Challenge&{message:string}> {
 if(!isArcadeAdmin(wallet)||!['arc','robinhood'].includes(network))throw new Error('Forbidden');
 const context=deploymentContext();
 const counts=await db.sql`SELECT COUNT(*)::int AS count FROM arcade_admin_challenges WHERE context=${context} AND wallet=${wallet.toLowerCase()} AND created_at>NOW()-INTERVAL '5 minutes'`;
 if(Number(counts[0].count)>=10)throw new Error('Too many sign-in requests. Please wait five minutes.');
 const value:Challenge={wallet:wallet.toLowerCase(),network:network as Challenge['network'],nonce:crypto.randomUUID(),origin,expiresAt:new Date(Date.now()+300000).toISOString()};
 await db.sql`INSERT INTO arcade_admin_challenges(context,nonce,wallet,network,origin,expires_at) VALUES(${context},${value.nonce},${value.wallet},${value.network},${origin},${value.expiresAt})`;
 return {...value,message:adminSignInMessage(value)};
}
async function verifyAdminSignature(value:Challenge,signature:`0x${string}`) {
 const config=paymentNetworkConfig(value.network),client=createPublicClient({transport:http(config.rpcUrl,{timeout:12000,retryCount:0})});
 if(await client.getChainId()!==config.chainId)return false;
 return client.verifyMessage({address:value.wallet as `0x${string}`,message:adminSignInMessage(value),signature});
}
export async function consumeAdminChallenge(nonce:string,signature:string,origin:string,db=adminDatabase(),verify=verifyAdminSignature) {
 if(!/^[0-9a-f-]{36}$/.test(nonce)||!/^0x(?:[0-9a-fA-F]{2})+$/.test(signature)||signature.length>20000)throw new Error('Forbidden');
 const context=deploymentContext(),rows=await db.sql`SELECT wallet,network,origin,expires_at FROM arcade_admin_challenges WHERE context=${context} AND nonce=${nonce}::uuid AND consumed_at IS NULL AND expires_at>NOW()`;
 const row=rows[0];if(!row||row.origin!==origin||!isArcadeAdmin(String(row.wallet)))throw new Error('Forbidden');
 // Date.toString() drops milliseconds. Preserve the timestamp byte-for-byte
 // because the expiration is part of the wallet's signed message.
 const expiresAt=row.expires_at instanceof Date?row.expires_at.toISOString():new Date(String(row.expires_at)).toISOString();
 const value:Challenge={nonce,wallet:String(row.wallet),network:row.network as Challenge['network'],origin,expiresAt};
 if(!await verify(value,signature as `0x${string}`))throw new Error('The admin wallet signature could not be verified.');
 const consumed=await db.sql`UPDATE arcade_admin_challenges SET consumed_at=NOW() WHERE context=${context} AND nonce=${nonce}::uuid AND consumed_at IS NULL AND expires_at>NOW() RETURNING nonce`;
 if(!consumed.length)throw new Error('This sign-in request has expired or already been used.');
 const token=randomBytes(32).toString('base64url');
 await db.sql`INSERT INTO arcade_admin_sessions(context,token_hash,wallet,expires_at) VALUES(${context},${adminTokenHash(token)},${value.wallet},${new Date(Date.now()+1800000).toISOString()})`;
 return token;
}
export async function readAdminSession(token:string,db=adminDatabase()) {
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const rows=await db.sql`SELECT wallet FROM arcade_admin_sessions WHERE context=${deploymentContext()} AND token_hash=${adminTokenHash(token)} AND expires_at>NOW()`;
 return rows[0]&&isArcadeAdmin(String(rows[0].wallet))?String(rows[0].wallet):null;
}
export async function deleteAdminSession(token:string,db=adminDatabase()) {
 if(token)await db.sql`DELETE FROM arcade_admin_sessions WHERE context=${deploymentContext()} AND token_hash=${adminTokenHash(token)}`;
}
