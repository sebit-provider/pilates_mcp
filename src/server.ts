#!/usr/bin/env node
import readline from "node:readline";
import { McpApp, type McpRequest } from "./mcp.js";

const app = new McpApp(process.env.PILATES_MCP_DATA_DIR);

function send(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  void (async () => {
    let request: McpRequest | undefined;
    try {
      request = JSON.parse(line) as McpRequest;
      const response = await app.handle(request);
      if (response) send(response);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: (error as Error).message }
      });
    }
  })();
});
