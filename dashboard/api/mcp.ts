const MCP_BASE = "https://owen-claude-memory.fly.dev";
const API_KEY = process.env.MCP_API_KEY || "";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${API_KEY}`,
  };

  const mcpSession = req.headers.get("Mcp-Session");
  if (mcpSession) {
    headers["Mcp-Session"] = mcpSession;
  }

  const upstream = await fetch(`${MCP_BASE}/`, {
    method: "POST",
    headers,
    body,
  });

  const responseHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) responseHeaders.set("Content-Type", ct);
  const session = upstream.headers.get("Mcp-Session");
  if (session) responseHeaders.set("Mcp-Session", session);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
