import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { McpApp } from "../src/mcp.js";

async function makeApp(): Promise<McpApp> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pilates-mcp-mcp-"));
  return new McpApp(root);
}

test("tools/list publishes output schemas for every MCP tool", async () => {
  const app = await makeApp();
  const response = await app.handle({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = ((response?.result as { tools?: Array<{ outputSchema?: { type?: string } }> }).tools ?? []);

  assert.ok(tools.length > 0);
  assert.equal(
    tools.every((tool) => tool.outputSchema?.type === "object"),
    true
  );
});

test("tools/call returns structuredContent matching object output schemas", async () => {
  const app = await makeApp();
  const response = await app.handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "create_poster",
      arguments: {
        title: "8월 회원권 이벤트",
        purpose: "event",
        content: {
          table: {
            columns: ["상품", "정상가", "이벤트가"],
            rows: [["1:1 개인레슨 10회", "800,000원", "650,000원"]],
            highlightColumn: 2
          }
        }
      }
    }
  });
  const result = response?.result as { structuredContent?: { valid?: boolean; missing?: string[] } };

  assert.equal(result.structuredContent?.valid, false);
  assert.ok(result.structuredContent?.missing?.includes("eventName"));
});

test("tools/call wraps array results as structuredContent items", async () => {
  const app = await makeApp();
  const response = await app.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "search_posters", arguments: {} }
  });
  const result = response?.result as { structuredContent?: { items?: unknown[] } };

  assert.deepEqual(result.structuredContent?.items, []);
});
