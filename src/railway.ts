import http from "node:http";
import { McpApp, type McpRequest } from "./mcp.js";
import { scheduleWorkspaceHtml } from "./schedule/ui.js";
import { toolSchemas } from "./toolSchemas.js";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.PILATES_MCP_DATA_DIR ?? "/data";
const mcp = new McpApp(dataDir);

const server = http.createServer((request, response) => {
  void handleHttp(request, response);
});

async function handleHttp(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "pilates_mcp", dataDir }));
    return;
  }

  if (request.url === "/tools") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ tools: toolSchemas.map((tool) => ({ name: tool.name, description: tool.description })) }));
    return;
  }

  if (request.url === "/schedule" || request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(scheduleWorkspaceHtml());
    return;
  }

  if (request.url === "/mcp") {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, endpoint: "/mcp", transport: "http-json-rpc" }));
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { "allow": "GET, POST", "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body) as McpRequest | McpRequest[];
      const result = Array.isArray(payload) ? await Promise.all(payload.map((item) => mcp.handle(item))) : await mcp.handle(payload);
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(Array.isArray(result) ? result.filter(Boolean) : result));
      return;
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: (error as Error).message } }));
      return;
    }
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).byteLength > 5_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

server.listen(port, "0.0.0.0", () => {
  console.log(`pilates_mcp Railway health server listening on ${port}`);
});
