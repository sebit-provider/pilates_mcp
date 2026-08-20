import http from "node:http";
import { scheduleWorkspaceHtml } from "./schedule/ui.js";
import { toolSchemas } from "./toolSchemas.js";

const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.PILATES_MCP_DATA_DIR ?? "/data";

const server = http.createServer((request, response) => {
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

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`pilates_mcp Railway health server listening on ${port}`);
});
