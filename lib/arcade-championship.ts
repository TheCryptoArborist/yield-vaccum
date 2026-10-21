export type ArcadeStanding = { id:string; nickname:string; flyer:number|null; invaders:number|null; stack?:number|null; runs:number; points:number; rank:number };
export function championship(rows:Omit<ArcadeStanding,'points'|'rank'>[]):ArcadeStanding[] {
 const points = new Map(rows.map(row=>[row.id,0]));
 for(const game of ['flyer','invaders','stack'] as const) {
  const competitors=rows.filter(row=>row[game]!=null).sort((a,b)=>b[game]!-a[game]!);
  let higher=0;
  competitors.forEach((row,index)=>{ if(index===0||row[game]!==competitors[index-1][game])higher=index;
   const award=competitors.length===1?1000:Math.round(100+900*(competitors.length-1-higher)/(competitors.length-1));
   points.set(row.id,points.get(row.id)!+award);
  });
 }
 const sorted=rows.map(row=>({...row,points:points.get(row.id)!,rank:0})).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
 let rank=0;
 return sorted.map((row,index)=>{if(index===0||row.points!==sorted[index-1].points)rank=index+1;return {...row,rank};});
}

export function gamesPlayedStandings(rows:Omit<ArcadeStanding,'points'|'rank'>[]):ArcadeStanding[] {
 const sorted=championship(rows).sort((a,b)=>b.runs-a.runs||a.id.localeCompare(b.id));
 let rank=0;
 return sorted.map((row,index)=>{if(index===0||row.runs!==sorted[index-1].runs)rank=index+1;return {...row,rank};});
}

export function arcadeWeekWindow(week?:string,now=new Date()) {
 const current=new Date(now);
 current.setUTCDate(current.getUTCDate()-((current.getUTCDay()+6)%7));
 current.setUTCHours(0,0,0,0);
 const start=week?new Date(`${week}T00:00:00.000Z`):current;
 if(week&&(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==week||start.getUTCDay()!==1||start>current))throw new Error('Choose a valid current or previous Monday for the weekly leaderboard.');
 return {start,end:new Date(start.getTime()+7*86400000)};
}
