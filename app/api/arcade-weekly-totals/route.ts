import { arcadeWeekWindow } from '../../../lib/arcade-championship';
import { readArcadeWeeklyEntryTotals } from '../../../db/arcade-weekly-entry-totals';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,network=params.get('chain');
 const headers={'Cache-Control':'no-store'};
 if(network!=='arc'&&network!=='robinhood')return Response.json({error:'Choose Robinhood Chain or Arc.'},{status:400,headers});
 let window:ReturnType<typeof arcadeWeekWindow>;
 try{window=arcadeWeekWindow(params.get('week')??undefined);}catch{return Response.json({error:'Choose a valid current or previous Monday.'},{status:400,headers});}
 const totals=await readArcadeWeeklyEntryTotals(network,window.start,window.end);
 return Response.json(totals,{status:totals.status==='unavailable'?503:200,headers});
}
