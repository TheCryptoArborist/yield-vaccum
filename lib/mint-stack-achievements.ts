export type StackProgress={runs:number;lines:number;bestLines:number;level:number;score:number;pieces:number;fours:number;networks:number};
export const STACK_ACHIEVEMENTS=[
  {id:'first-drop',name:'First Drop',description:'Finish and save your first paid game.',metric:'runs',target:1,unit:'games',shape:3,tone:'mint'},
  {id:'clean-slate',name:'Clean Slate',description:'Clear your first line in a saved game.',metric:'lines',target:1,unit:'lines',shape:0,tone:'mint'},
  {id:'mint-quad',name:'Mint Quad',description:'Clear four lines at once in a saved game.',metric:'fours',target:1,unit:'four-line clears',shape:0,tone:'gold'},
  {id:'double-digits',name:'Double Digits',description:'Clear 10 lines in one saved game.',metric:'bestLines',target:10,unit:'best lines',shape:4,tone:'mint'},
  {id:'rising-stack',name:'Rising Stack',description:'Reach level 3 in one saved game.',metric:'level',target:3,unit:'level',shape:2,tone:'purple'},
  {id:'skyline',name:'Skyline',description:'Reach level 5 in one saved game.',metric:'level',target:5,unit:'level',shape:6,tone:'gold'},
  {id:'five-k',name:'5K Club',description:'Score 5,000 points in one saved game.',metric:'score',target:5000,unit:'best points',shape:1,tone:'mint'},
  {id:'twenty-k',name:'20K Club',description:'Score 20,000 points in one saved game.',metric:'score',target:20000,unit:'best points',shape:1,tone:'gold'},
  {id:'line-miner',name:'Line Miner',description:'Clear 100 lines across saved games.',metric:'lines',target:100,unit:'total lines',shape:5,tone:'purple'},
  {id:'block-builder',name:'Block Builder',description:'Place 250 pieces across saved games.',metric:'pieces',target:250,unit:'total pieces',shape:3,tone:'purple'},
  {id:'mint-regular',name:'Mint Regular',description:'Finish and save 10 paid games.',metric:'runs',target:10,unit:'games',shape:2,tone:'gold'},
  {id:'chain-hopper',name:'Chain Hopper',description:'Save a paid game on both Arc and Robinhood Chain.',metric:'networks',target:2,unit:'networks',shape:4,tone:'purple'},
] as const;
export const emptyStackProgress:StackProgress={runs:0,lines:0,bestLines:0,level:0,score:0,pieces:0,fours:0,networks:0};
export const stackAchievements=(progress:StackProgress)=>STACK_ACHIEVEMENTS.filter(a=>progress[a.metric]>=a.target).map(a=>a.id);
export type StackProfile=StackProgress&{nickname:string;unlocked:string[]};
