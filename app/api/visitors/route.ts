import { getDeployStore, getStore } from "@netlify/blobs";

function visitorStore() {
  return process.env.CONTEXT === "production"
    ? getStore("yield-vacuum-visitors", { consistency: "strong" })
    : getDeployStore("yield-vacuum-visitors");
}

async function visitorCount() {
  let count = 0;
  for await (const page of visitorStore().list({ prefix: "visitors/", paginate: true })) {
    count += page.blobs.length;
  }
  return count;
}

export async function GET() {
  try {
    return Response.json({ count: await visitorCount() });
  } catch {
    return Response.json({ error: "Visitor count is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const visitorId = String(payload.visitorId ?? "").trim();
    if (!/^[a-f0-9-]{32,40}$/i.test(visitorId)) {
      return Response.json({ error: "Visitor could not be counted." }, { status: 400 });
    }
    const store = visitorStore();
    const key = `visitors/${visitorId}.json`;
    if (!(await store.getMetadata(key))) {
      await store.setJSON(key, { firstVisit: new Date().toISOString() });
    }
    return Response.json({ count: await visitorCount() });
  } catch {
    return Response.json({ error: "Visitor count is temporarily unavailable." }, { status: 503 });
  }
}
