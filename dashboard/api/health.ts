const MCP_BASE = "https://owen-claude-memory.fly.dev";

export const config = {
  runtime: "edge",
};

export default async function handler(): Promise<Response> {
  const upstream = await fetch(`${MCP_BASE}/health`);
  const data = await upstream.text();

  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
