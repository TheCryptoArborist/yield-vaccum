import { questApi } from '../../../../lib/quest-pilot-api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = (request: Request) => questApi(request, 'session');
export const POST = (request: Request) => questApi(request, 'session');
export const DELETE = (request: Request) => questApi(request, 'session');
