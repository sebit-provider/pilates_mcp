import http from "node:http";
import { McpApp, type McpRequest } from "./mcp.js";
import { OAuthServer } from "./oauth.js";
import { scheduleWorkspaceHtml } from "./schedule/ui.js";
import { toolSchemas } from "./toolSchemas.js";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.PILATES_MCP_DATA_DIR ?? "/data";
const mcp = new McpApp(dataDir);
const oauth = new OAuthServer();

const server = http.createServer((request, response) => {
  void handleHttp(request, response);
});

async function handleHttp(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (url.pathname === "/health") {
    writeJson(response, 200, { ok: true, service: "pilates_mcp", dataDir, authRequired: oauth.authRequired() });
    return;
  }

  if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
    writeJson(response, 200, oauth.protectedResourceMetadata(request));
    return;
  }

  if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/openid-configuration") {
    writeJson(response, 200, oauth.metadata(request));
    return;
  }

  if (url.pathname === "/register") {
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "method_not_allowed" }, { allow: "POST" });
      return;
    }
    try {
      writeJson(response, 201, oauth.register(JSON.parse(await readBody(request)) as Record<string, unknown>));
    } catch (error) {
      writeJson(response, 400, { error: "invalid_client_metadata", error_description: (error as Error).message });
    }
    return;
  }

  if (url.pathname === "/authorize") {
    if (request.method === "GET") {
      const page = oauth.authorizePage(url.toString());
      writeHtml(response, page.status, page.html);
      return;
    }
    if (request.method === "POST") {
      const result = await oauth.authorizePost(await readBody(request));
      if (result.location) {
        console.log(`OAuth authorization approved; redirecting client to ${result.location}`);
        response.writeHead(result.status, { location: result.location });
        response.end();
      } else {
        writeHtml(response, result.status, result.html ?? "");
      }
      return;
    }
    writeJson(response, 405, { error: "method_not_allowed" }, { allow: "GET, POST" });
    return;
  }

  if (url.pathname === "/token") {
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "method_not_allowed" }, { allow: "POST" });
      return;
    }
    try {
      writeJson(response, 200, oauth.token(await readBody(request), request.headers.authorization), { "cache-control": "no-store", pragma: "no-cache" });
    } catch (error) {
      writeJson(response, 400, { error: (error as Error).message });
    }
    return;
  }

  if (url.pathname === "/tools") {
    response.writeHead(200, jsonHeaders());
    response.end(JSON.stringify({ tools: toolSchemas.map((tool) => ({ name: tool.name, description: tool.description })) }));
    return;
  }

  if (url.pathname === "/schedule" || url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...corsHeaders() });
    response.end(scheduleWorkspaceHtml());
    return;
  }

  if (url.pathname === "/mcp") {
    if (request.method === "GET") {
      writeJson(response, 200, {
        ok: true,
        endpoint: "/mcp",
        transport: "http-json-rpc",
        authRequired: oauth.authRequired(),
        authorizationServer: "/.well-known/oauth-authorization-server",
        protectedResource: "/.well-known/oauth-protected-resource/mcp"
      });
      return;
    }
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "method_not_allowed" }, { allow: "GET, POST" });
      return;
    }
    const authorized = oauth.verifyRequest(request);
    if (!authorized.ok) {
      writeJson(response, 401, { error: "unauthorized", error_description: authorized.message }, { "www-authenticate": oauth.challenge(request) });
      return;
    }
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body) as McpRequest | McpRequest[];
      const result = Array.isArray(payload) ? await Promise.all(payload.map((item) => mcp.handle(item))) : await mcp.handle(payload);
      response.writeHead(200, jsonHeaders());
      response.end(JSON.stringify(Array.isArray(result) ? result.filter(Boolean) : result));
      return;
    } catch (error) {
      response.writeHead(400, jsonHeaders());
      response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: (error as Error).message } }));
      return;
    }
  }

  response.writeHead(404, jsonHeaders());
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

function writeJson(response: http.ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { ...jsonHeaders(), ...headers });
  if (status === 204) response.end();
  else response.end(JSON.stringify(value));
}

function writeHtml(response: http.ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...corsHeaders() });
  response.end(html);
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json; charset=utf-8", ...corsHeaders() };
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
    "access-control-expose-headers": "www-authenticate"
  };
}

server.listen(port, "0.0.0.0", () => {
  console.log(`pilates_mcp Railway health server listening on ${port}`);
});
