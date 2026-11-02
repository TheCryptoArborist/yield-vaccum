import { questApi } from '../../../../lib/quest-pilot-api';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const POST = (request: Request) => questApi(request, 'actions');
