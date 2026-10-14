import type { ReactNode } from "react";

// The same pixel silhouettes used by the game, composed into collectible scenes.
const aliens = [
  ["00100100", "00011000", "00111100", "01111110", "11011011", "11111111", "10100101", "00100100"],
  ["00011000", "00111100", "01111110", "11011011", "11111111", "00100100", "01011010", "10100101"],
  ["00111100", "01111110", "11111111", "11011011", "11111111", "01000010", "10100101", "01000010"],
];
const ship = ["0001000", "0011100", "0011100", "0111110", "1111111", "1101011", "1000001"];
const bunker = ["0011111100", "0111111110", "1111111111", "1111111111", "1110000111", "1100000011"];
const shield = ["00111111100", "01111111110", "11000000011", "11000000011", "11000000011", "11000000011", "01100000110", "01100000110", "00110001100", "00011011000", "00001110000", "00000100000"];
const mint = "#00f5d4", purple = "#c88bff", gold = "#ffce78", white = "#e1fff9", pink = "#ff79ad";
function Pixels({ bitmap, x, y, color, scale = 1 }: { bitmap: string[]; x: number; y: number; color: string; scale?: number }) {
  return <g fill={color}>{bitmap.flatMap((row, iy) => [...row].map((pixel, ix) => pixel === "1" ? <rect key={`${ix}-${iy}`} x={x + ix * scale} y={y + iy * scale} width={scale} height={scale} /> : null))}</g>;
}
function Spark({x,y,color=gold}:{x:number;y:number;color?:string}) {
  return <g fill={color}><rect x={x} y={y-2} width="1" height="5"/><rect x={x-2} y={y} width="5" height="1"/></g>;
}
export default function InvadersBadge({ icon }: { icon: string }) {
  const pilot = (x:number,y:number,color=mint,scale=1) => <Pixels bitmap={ship} x={x} y={y} color={color} scale={scale}/>;
  const alien = (kind:number,x:number,y:number,color=mint,scale=1) => <Pixels bitmap={aliens[kind]} x={x} y={y} color={color} scale={scale}/>;
  const scenes: Record<string, ReactNode> = {
    target: <>{alien(0,8,7,mint,2)}<rect x="12" y="13" width="2" height="2" fill={white}/><rect x="18" y="13" width="2" height="2" fill={white}/><Spark x={25} y={5} color={purple}/></>,
    shield: <>{alien(1,12,5,purple)}<Pixels bitmap={bunker} x={6} y={19} color={mint} scale={2}/><rect x="15" y="14" width="2" height="3" fill={pink}/></>,
    fleet: <>{alien(0,4,5,mint)}{alien(2,20,5,gold)}{alien(1,12,17,purple)}<rect x="14" y="4" width="4" height="1" fill={purple}/><rect x="7" y="15" width="1" height="4" fill={mint}/><rect x="24" y="15" width="1" height="4" fill={gold}/></>,
    boss: <>{alien(1,4,6,pink,3)}<g fill={white}><rect x="10" y="12" width="3" height="3"/><rect x="19" y="12" width="3" height="3"/></g><Spark x={5} y={24}/><Spark x={26} y={4}/></>,
    orbit: <><g fill={purple}><rect x="20" y="4" width="6" height="2"/><rect x="18" y="6" width="10" height="6"/><rect x="20" y="12" width="6" height="2"/></g><g fill={gold}><rect x="15" y="10" width="4" height="2"/><rect x="26" y="6" width="4" height="2"/></g>{pilot(5,17,mint,2)}<rect x="9" y="29" width="2" height="2" fill={gold}/><rect x="13" y="29" width="2" height="2" fill={pink}/></>,
    crosshair: <>{alien(2,8,7,mint,2)}<g fill={pink}><rect x="2" y="3" width="6" height="2"/><rect x="2" y="3" width="2" height="6"/><rect x="24" y="3" width="6" height="2"/><rect x="28" y="3" width="2" height="6"/><rect x="2" y="25" width="6" height="2"/><rect x="2" y="21" width="2" height="6"/><rect x="24" y="25" width="6" height="2"/><rect x="28" y="21" width="2" height="6"/></g></>,
    bolt: <><Pixels bitmap={shield} x={3} y={6} color={mint}/><g fill={purple}><rect x="20" y="5" width="2" height="16"/><rect x="25" y="5" width="2" height="16"/><rect x="19" y="7" width="4" height="3"/><rect x="24" y="7" width="4" height="3"/></g><Spark x={16} y={25}/></>,
    star: <>{alien(2,8,9,mint,2)}<Spark x={7} y={5}/><Spark x={25} y={5}/><rect x="12" y="26" width="8" height="2" fill={gold}/></>,
    wings: <>{pilot(9,10,purple,2)}<g fill={mint}><rect x="3" y="7" width="2" height="12"/><rect x="5" y="17" width="3" height="2"/><rect x="27" y="7" width="2" height="12"/><rect x="24" y="17" width="3" height="2"/></g><rect x="15" y="3" width="2" height="4" fill={gold}/><rect x="13" y="25" width="6" height="3" fill={pink}/></>,
    crown: <>{alien(2,8,12,gold,2)}<g fill={white}><rect x="8" y="4" width="3" height="5"/><rect x="14" y="2" width="4" height="7"/><rect x="21" y="4" width="3" height="5"/><rect x="8" y="9" width="16" height="2"/></g><Spark x={4} y={16} color={purple}/><Spark x={28} y={16} color={mint}/></>,
    medal: <><Pixels bitmap={bunker} x={6} y={21} color={mint} scale={2}/>{pilot(9,7,gold,2)}<g fill={purple}><rect x="3" y="5" width="2" height="12"/><rect x="27" y="5" width="2" height="12"/></g><Spark x={16} y={3}/></>,
    link: <>{pilot(3,12,mint,1.5)}{pilot(19,12,purple,1.5)}<g fill={gold}><rect x="12" y="15" width="7" height="2"/><rect x="14" y="12" width="3" height="8"/></g><Spark x={8} y={6} color={mint}/><Spark x={24} y={6} color={purple}/></>,
  };
  return <svg viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges" className="invadersPixelBadge"><g fill="#a3d8eb" opacity=".3"><rect x="3" y="11" width="1" height="1"/><rect x="28" y="23" width="1" height="1"/><rect x="5" y="28" width="1" height="1"/><rect x="18" y="3" width="1" height="1"/></g>{scenes[icon] ?? scenes.target}</svg>;
}
