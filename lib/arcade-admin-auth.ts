import { createHash } from 'node:crypto';
export const ADMIN_COOKIE='__Secure-mss2-arcade-admin';
export const adminHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
// Public address only; access always requires a verified signature and private session.
export const ARCADE_ADMIN_WALLET='0xF2Ab1eEBbEcb4E315FE95D8b532D1aB00F1A8789';
export function isArcadeAdmin(wallet:string) {
 return /^0x[0-9a-fA-F]{40}$/.test(wallet)&&wallet.toLowerCase()===ARCADE_ADMIN_WALLET.toLowerCase();
}
export function adminTokenHash(token:string) { return createHash('sha256').update(token).digest('hex'); }
export function adminToken(request:Request) {
 const value=(request.headers.get('cookie')??'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length+1)??'';
 return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';
}
export function adminCookie(token:string,maxAge=1800) {return `${ADMIN_COOKIE}=${token}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
export function requireSameOrigin(request:Request) {
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Forbidden');
}
export function adminSignInMessage(value:{wallet:string;network:string;nonce:string;origin:string;expiresAt:string}) {
 return `${value.origin} — MSS2 rewards administrator sign-in\n\nAuthorize access to private weekly reward wallet records. This signature does not transfer tokens or approve spending.\n\nWallet: ${value.wallet.toLowerCase()}\nNetwork: ${value.network}\nNonce: ${value.nonce}\nExpires: ${value.expiresAt}`;
}
