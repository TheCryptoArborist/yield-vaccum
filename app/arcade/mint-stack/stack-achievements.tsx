import { STACK_ACHIEVEMENTS,emptyStackProgress,type StackProfile } from '../../../lib/mint-stack-achievements';
import { SHAPES } from '../../../lib/mint-stack';
import styles from './stack-achievements.module.css';
export default function StackAchievements({profile,newlyUnlocked}:{profile:StackProfile|null;newlyUnlocked:string[]}){
  const progress=profile??emptyStackProgress;
  return <section className={styles.collection} id='stack-achievements' aria-label='Mint Stack achievements'>
    <header><div><small>BUILD YOUR COLLECTION</small><h2>BLOCK BY BLOCK.</h2><p>{profile?.runs?`${profile.nickname} · Progress follows your paying wallet across saved games.`:'Finish a paid game and save your score to start your collection.'}</p></div><b>{profile?.unlocked.length??0}<span> / {STACK_ACHIEVEMENTS.length} UNLOCKED</span></b></header>
    <p className={styles.notice}>Badges unlock from verified, saved runs. Your previous saved games count too.</p>
    {newlyUnlocked.length>0&&<p className={styles.unlock} role='status'>NEW BADGES · {STACK_ACHIEVEMENTS.filter(a=>newlyUnlocked.includes(a.id)).map(a=>a.name).join(' · ')}</p>}
    <div className={styles.grid}>{STACK_ACHIEVEMENTS.map((a,index)=>{
      const earned=profile?.unlocked.includes(a.id)??false,value=Math.min(progress[a.metric],a.target),fresh=newlyUnlocked.includes(a.id);
      const shape=SHAPES[a.shape];
      return <article key={a.id} className={`${styles.card} ${styles[a.tone]} ${earned?styles.earned:styles.locked} ${fresh?styles.fresh:''}`}>
        <div className={styles.art} aria-hidden='true'><svg viewBox='0 0 100 108' fill='none'><path d='M50 3 91 26v48l-41 29L9 74V26Z' fill='currentColor' fillOpacity='.07' stroke='currentColor' strokeWidth='2'/><path d='m50 11 34 19v40l-34 24-34-24V30Z' stroke='currentColor' strokeOpacity='.2'/><path d='M26 82h48M32 87h36' stroke='currentColor' strokeWidth='2'/>{shape.map((row,y)=>row.map((cell,x)=>cell?<g key={`${x}-${y}`}><rect x={20+x*15} y={23+y*15} width='13' height='13' rx='2' fill='currentColor'/><path d={`m${22+x*15} ${33+y*15}v-8h8`} stroke='white' strokeOpacity='.55' strokeWidth='1.5'/></g>:null))}<text x='50' y='99' textAnchor='middle' fill='currentColor' fontSize='6' letterSpacing='2'>{String(index+1).padStart(2,'0')}</text></svg>{earned&&<span>✓</span>}</div>
        <div className={styles.copy}><small>{fresh?'JUST UNLOCKED':earned?'UNLOCKED':'TO UNLOCK'}</small><h3>{a.name}</h3><p>{a.description}</p><div className={styles.progress} role='progressbar' aria-label={`${a.name} progress`} aria-valuemin={0} aria-valuemax={a.target} aria-valuenow={value}><i style={{width:`${value/a.target*100}%`}}/></div><span>{value.toLocaleString()} / {a.target.toLocaleString()} {a.unit}</span></div>
      </article>;
    })}</div>
  </section>;
}
