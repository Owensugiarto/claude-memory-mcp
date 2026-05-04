const MCP_BASE = "https://owen-claude-memory.fly.dev";
const API_KEY = process.env.MCP_API_KEY || "";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Strip /api/proxy prefix, forward the rest
  const path = url.pathname.replace(/^\/api\/proxy/, '') + url.search;

  const upstream = await fetch(`${MCP_BASE}/api${path}`, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: req.method !== "GET" ? await req.text() : undefined,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}
