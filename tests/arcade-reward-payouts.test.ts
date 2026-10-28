import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateRewardPayouts,eligibleRewardRecipients,parseRewardAmount,exactRewardAmount,rewardPayoutCsv,payoutFingerprint} from '../lib/arcade-reward-payouts';
import {rewardExcluded} from '../lib/arcade-reward-policy';
import {ARCADE_ADMIN_WALLET} from '../lib/arcade-admin-auth';
import type {AdminRewards,AdminRewardRow} from '../lib/arcade-admin-rewards';
const row=(n:number,games:number):AdminRewardRow=>({id:`pilot-${n}`,rank:n,nickname:`Pilot ${n}`,wallet:'0x'+n.toString(16).padStart(40,'0'),games,flyerGames:games,invadersGames:0,stackGames:0,networks:['robinhood'],unknownNetwork:false});
const data=(rows:AdminRewardRow[],closed=true):AdminRewards=>({rows,weekStart:'2026-10-19T00:00:00.000Z',weekEnd:'2026-10-26T00:00:00.000Z',closed,pilots:rows.length,tieReview:false});
test('founder exclusion uses the wallet even after rename, plus the requested Crypto Arborist name',()=>{
 assert.equal(rewardExcluded({...row(1,10),wallet:ARCADE_ADMIN_WALLET,nickname:'Another name'}),true);
 assert.equal(rewardExcluded({...row(1,10),nickname:'Crypto Arborist'}),true);
 assert.equal(rewardExcluded({...row(1,10),nickname:'The Crypto Arborist'}),true);
 assert.equal(rewardExcluded(row(1,10)),false);
});
test('proportional rewards exclude the founder, promote eligible players, and preserve full MSS2 precision',()=>{
 const board=data([{...row(9,100),wallet:ARCADE_ADMIN_WALLET},row(1,3),row(2,2)]);
 const payouts=calculateRewardPayouts(board,'1479.463602849953082094');
 assert.deepEqual(payouts.map(p=>[p.rank,p.games,p.sharePercent]),[[1,3,'60.00%'],[2,2,'40.00%']]);
 assert.deepEqual(payouts.map(p=>p.amount),['887.678161709971849256','591.785441139981232838']);
 assert.equal(payouts.reduce((sum,p)=>sum+BigInt(p.amountRaw),BigInt(0)),parseRewardAmount('1479.463602849953082094'));
});
test('top-three cutoff includes all third-place ties and never pays fourth place after distinct higher counts',()=>{
 assert.deepEqual(eligibleRewardRecipients([row(1,9),row(2,8),row(3,7),row(4,7),row(5,6)]).map(r=>r.games),[9,8,7,7]);
 assert.deepEqual(eligibleRewardRecipients([row(1,9),row(2,9),row(3,8),row(4,8),row(5,7)]).map(r=>r.rank),[1,1,3,3]);
 assert.deepEqual(eligibleRewardRecipients([row(1,9),row(2,8),row(3,7),row(4,6)]).map(r=>r.id),['pilot-1','pilot-2','pilot-3']);
});
test('token remainder allocation is deterministic, independent of nickname and input order, and conserves tiny budgets',()=>{
 const rows=[row(3,1),row(2,1),row(1,1)];
 const first=calculateRewardPayouts(data(rows),'0.000000000000000002');
 const second=calculateRewardPayouts(data([...rows].reverse().map(r=>({...r,nickname:'Renamed'}))),'0.000000000000000002');
 assert.deepEqual(first.map(r=>[r.wallet,r.amountRaw]),second.map(r=>[r.wallet,r.amountRaw]));
 assert.deepEqual(first.map(r=>r.amountRaw),['1','1','0']);
 assert.equal(calculateRewardPayouts(data([row(1,1)]),'1')[0].amount,'1');
});
test('payout CSV requires a closed week and confirmed networks and labels the draft as not sent',()=>{
 const pilot={...row(1,2),networks:['arc','robinhood'] as const};
 const board=data([{...pilot,networks:[...pilot.networks],nickname:'=HYPERLINK("evil")'}]);
 assert.throws(()=>rewardPayoutCsv(board,'100',{},'custom'),/Confirm a payout network/);
 assert.throws(()=>rewardPayoutCsv({...board,closed:false},'100',{'pilot-1':'arc'},'custom'),/closes/);
 const csv=rewardPayoutCsv(board,'100',{'pilot-1':'arc'},'custom budget');
 assert.match(csv,/'=HYPERLINK/);assert.match(csv,/,"100","arc","100","custom budget","REVIEWED PLAN - NOT SENT"/);
 assert.throws(()=>rewardPayoutCsv(board,'100',{'pilot-1':'invalid' as 'arc'},'custom'),/Confirm/);
 const unknown=data([{...row(1,2),networks:[],unknownNetwork:true}]);
 assert.throws(()=>rewardPayoutCsv(unknown,'100',{},'custom'),/Confirm/);
 assert.match(rewardPayoutCsv(unknown,'100',{'pilot-1':'arc'},'custom'),/"arc"/);
});
test('budget inputs reject overprecision, signs, exponents and empty or invalid recipient sets',()=>{
 for(const value of ['-1','1e3','1,000','.5','1.0000000000000000001','NaN',''])assert.throws(()=>parseRewardAmount(value));
 assert.throws(()=>calculateRewardPayouts(data([row(1,1)]),'0'),/greater than zero/);
 assert.throws(()=>calculateRewardPayouts(data([]),'1'),/no eligible/);
 assert.throws(()=>calculateRewardPayouts(data([row(1,1),row(1,1)]),'1'),/wallets/);
 assert.throws(()=>calculateRewardPayouts(data([{...row(1,1),games:1.5}]),'1'),/game counts/);
 assert.equal(exactRewardAmount(parseRewardAmount('999999999999999999999999.123456789012345678')),'999999999999999999999999.123456789012345678');
});
test('a changed wallet, count, week or network history invalidates the reviewed recipient fingerprint',()=>{
 const original=data([row(1,2),row(2,1)]),fingerprint=payoutFingerprint(original);
 for(const changed of [{...original,weekStart:'2026-10-12T00:00:00.000Z'},{...original,rows:[row(1,3),row(2,1)]},{...original,rows:[{...row(1,2),wallet:row(3,2).wallet},row(2,1)]},{...original,rows:[{...row(1,2),unknownNetwork:true},row(2,1)]}])assert.notEqual(payoutFingerprint(changed),fingerprint);
});
