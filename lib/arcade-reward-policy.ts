// Public policy only. Administrator access is enforced separately by signatures.
export const REWARD_EXCLUDED_WALLETS=['0xf2ab1eebbecb4e315fe95d8b532d1ab00f1a8789'];
export function rewardExcluded(player:{wallet:string;nickname:string}){
 const name=player.nickname.toLowerCase().replace(/[^a-z0-9]/g,'');
 return REWARD_EXCLUDED_WALLETS.includes(player.wallet.toLowerCase())||name==='cryptoarborist'||name==='thecryptoarborist';
}
