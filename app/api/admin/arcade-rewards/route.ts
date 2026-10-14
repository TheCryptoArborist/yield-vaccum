import {readAdminSession} from '../../../../db/arcade-admin-session';
import {readAdminRewards} from '../../../../db/arcade-admin-rewards';
import {adminHeaders,adminToken} from '../../../../lib/arcade-admin-auth';
import {arcadeWeekWindow} from '../../../../lib/arcade-championship';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try{
  const token=adminToken(request);
  if(!token||!await readAdminSession(token))return Response.json({error:'Administrator sign-in required.'},{status:401,headers:adminHeaders});
  const week=new URL(request.url).searchParams.get('week')??undefined;
  try{arcadeWeekWindow(week);}catch{return Response.json({error:'Choose a current or previous Monday.'},{status:400,headers:adminHeaders});}
  return Response.json(await readAdminRewards(week),{headers:adminHeaders});
 }catch{return Response.json({error:'Private reward records are temporarily unavailable.'},{status:503,headers:adminHeaders});}
}
