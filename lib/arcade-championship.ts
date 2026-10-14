export type ArcadeStanding = { id:string; nickname:string; flyer:number|null; invaders:number|null; runs:number; points:number; rank:number };
export function championship(rows:Omit<ArcadeStanding,'points'|'rank'>[]):ArcadeStanding[] {
 const points = new Map(rows.map(row=>[row.id,0]));
 for(const game of ['flyer','invaders'] as const) {
  const competitors=rows.filter(row=>row[game]!==null).sort((a,b)=>b[game]!-a[game]!);
  competitors.forEach(row=>{ const higher=competitors.filter(other=>other[game]!>row[game]!).length;
   const award=competitors.length===1?1000:Math.round(100+900*(competitors.length-1-higher)/(competitors.length-1));
   points.set(row.id,points.get(row.id)!+award);
  });
 }
 const sorted=rows.map(row=>({...row,points:points.get(row.id)!,rank:0})).sort((a,b)=>b.points-a.points||a.id.localeCompare(b.id));
 return sorted.map((row,index)=>({...row,rank:index>0&&row.points===sorted[index-1].points?sorted.findIndex(other=>other.points===row.points)+1:index+1}));
}
