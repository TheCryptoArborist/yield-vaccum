import {createAdminChallenge,consumeAdminChallenge,readAdminSession,deleteAdminSession} from '../../../../db/arcade-admin-session';
import {adminCookie,adminHeaders,adminToken,requireSameOrigin} from '../../../../lib/arcade-admin-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {const token=adminToken(request),wallet=token?await readAdminSession(token):null;return Response.json({authenticated:!!wallet,wallet},{headers:adminHeaders});}
 catch{return Response.json({authenticated:false},{status:503,headers:adminHeaders});}
}
export async function POST(request:Request) {
 try {
  requireSameOrigin(request);const text=await request.text();if(text.length>24000)throw new Error('Forbidden');
  const body=JSON.parse(text);
  if(body.action==='challenge')return Response.json(await createAdminChallenge(String(body.wallet??''),String(body.network??''),new URL(request.url).origin),{headers:adminHeaders});
  if(body.action!=='verify')throw new Error('Forbidden');
  const token=await consumeAdminChallenge(String(body.nonce??''),String(body.signature??''),new URL(request.url).origin);
  return Response.json({authenticated:true},{headers:{...adminHeaders,'Set-Cookie':adminCookie(token)}});
 }catch(error){return Response.json({error:error instanceof Error&&/^(The admin wallet signature|This sign-in request|Too many sign-in)/.test(error.message)?error.message:'Only the configured administrator wallet can sign in. Reconnect and retry if the service is unavailable.'},{status:403,headers:adminHeaders});}
}
export async function DELETE(request:Request) {
 try{requireSameOrigin(request);await deleteAdminSession(adminToken(request));return Response.json({authenticated:false},{headers:{...adminHeaders,'Set-Cookie':adminCookie('',0)}});}
 catch{return Response.json({error:'Sign-out failed.'},{status:403,headers:adminHeaders});}
}
