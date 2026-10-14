import { readArcadeLobby } from '../../../db/arcade-lobby';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 const url=new URL(request.url);
 const keys=url.searchParams.getAll('playerKey').filter(key=>/^[a-zA-Z0-9-]{16,80}$/.test(key)).slice(0,2);
 try { return Response.json(await readArcadeLobby(keys,url.searchParams.get('period')!=='all'),{headers:{'Cache-Control':'no-store'}}); }
 catch { return Response.json({error:'Arcade standings are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
