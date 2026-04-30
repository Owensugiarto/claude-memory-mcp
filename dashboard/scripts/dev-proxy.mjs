import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local if present
let apiKey = process.env.API_KEY;
if (!apiKey) {
  try {
    const envPath = resolve(import.meta.dirname, ".env.local");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^API_KEY\s*=\s*(.+)$/);
      if (match) {
        apiKey = match[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // no .env.local
  }
}

if (!apiKey) {
  console.error("ERROR: API_KEY not set. Set it in environment or .env.local");
  process.exit(1);
}

const UPSTREAM = "https://owen-claude-memory.fly.dev";
const PORT = 3001;

async function proxy(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  let target;
  if (url.pathname === "/api/mcp") {
    target = UPSTREAM;
  } else if (url.pathname === "/api/health") {
    target = `${UPSTREAM}/health`;
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // Read request body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  // Forward headers
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": req.headers["content-type"] || "application/json",
    Accept: req.headers["accept"] || "application/json",
  };
  if (req.headers["mcp-session"]) {
    headers["Mcp-Session"] = req.headers["mcp-session"];
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== "GET" && body.length > 0 ? body : undefined,
    });

    // Copy response headers
    for (const [key, value] of upstream.headers.entries()) {
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    }

    res.writeHead(upstream.status);
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    res.end(responseBody);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream unreachable" }));
  }
}

const server = createServer(proxy);
server.listen(PORT, () => {
  console.log(`Dev proxy listening on http://localhost:${PORT}`);
  console.log(`  /api/mcp    -> ${UPSTREAM}`);
  console.log(`  /api/health -> ${UPSTREAM}/health`);
});
