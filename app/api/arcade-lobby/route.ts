import { readArcadeLobby } from '../../../db/arcade-lobby';
import { arcadeWeekWindow } from '../../../lib/arcade-championship';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 const url=new URL(request.url);
 const keys=url.searchParams.getAll('playerKey').filter(key=>/^[a-zA-Z0-9-]{16,80}$/.test(key)).slice(0,2);
 const week=url.searchParams.get('week')??undefined;
 const page=Number(url.searchParams.get('page')??1);
 if(!Number.isInteger(page)||page<1||page>100000)return Response.json({error:'Choose a valid leaderboard page.'},{status:400,headers:{'Cache-Control':'no-store'}});
 try { arcadeWeekWindow(week); } catch { return Response.json({error:'Choose a valid current or previous Monday for the weekly leaderboard.'},{status:400,headers:{'Cache-Control':'no-store'}}); }
 try { return Response.json(await readArcadeLobby(keys,url.searchParams.get('period')!=='all',undefined,{ranking:url.searchParams.get('ranking')==='points'?'points':'games',week,page}),{headers:{'Cache-Control':'no-store'}}); }
 catch { return Response.json({error:'Arcade standings are temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
