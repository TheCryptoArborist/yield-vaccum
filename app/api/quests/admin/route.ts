import { questApi } from '../../../../lib/quest-pilot-api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = (request: Request) => questApi(request, 'admin');
export const POST = (request: Request) => questApi(request, 'admin');
