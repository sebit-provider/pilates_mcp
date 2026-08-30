import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type http from "node:http";
import test from "node:test";
import { OAuthServer } from "../src/oauth.js";

function fakeRequest(headers: Record<string, string> = {}): http.IncomingMessage {
  return { headers } as http.IncomingMessage;
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

test("publishes OAuth discovery metadata for the MCP endpoint", () => {
  process.env.PILATES_MCP_PUBLIC_URL = "https://example.test";
  const oauth = new OAuthServer("secret");
  const resource = oauth.protectedResourceMetadata(fakeRequest());
  const metadata = oauth.metadata(fakeRequest());
  assert.equal(resource.resource, "https://example.test/mcp");
  assert.deepEqual(resource.authorization_servers, ["https://example.test"]);
  assert.equal(metadata.authorization_endpoint, "https://example.test/authorize");
  assert.equal(metadata.token_endpoint, "https://example.test/token");
  assert.equal(metadata.registration_endpoint, "https://example.test/register");
  delete process.env.PILATES_MCP_PUBLIC_URL;
});

test("supports dynamic client registration and authorization_code with PKCE", async () => {
  const oauth = new OAuthServer("secret");
  const client = oauth.register({
    client_name: "ChatGPT",
    redirect_uris: ["https://chat.openai.com/aip/callback"]
  });
  assert.equal(client.token_endpoint_auth_method, "none");
  assert.equal(client.client_secret, undefined);
  const verifier = "test-verifier-123456789";
  const authBody = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "https://chat.openai.com/aip/callback",
    state: "state-1",
    code_challenge: challenge(verifier),
    code_challenge_method: "S256",
    scope: "mcp:read mcp:write",
    password: "secret"
  });
  const authorized = await oauth.authorizePost(authBody.toString());
  assert.equal(authorized.status, 302);
  assert.ok(authorized.location);
  const redirect = new URL(authorized.location);
  const code = redirect.searchParams.get("code");
  assert.ok(code);
  assert.equal(redirect.searchParams.get("state"), "state-1");

  const token = oauth.token(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://chat.openai.com/aip/callback",
      client_id: client.client_id,
      code_verifier: verifier
    }).toString()
  );
  assert.equal(token.token_type, "Bearer");
  assert.equal(typeof token.access_token, "string");
  assert.equal(oauth.verifyRequest(fakeRequest({ authorization: `Bearer ${token.access_token}` })).ok, true);
});

test("supports confidential clients using client_secret_basic", async () => {
  const oauth = new OAuthServer("secret");
  const client = oauth.register({
    client_name: "ChatGPT",
    redirect_uris: ["https://chat.openai.com/aip/callback"],
    token_endpoint_auth_method: "client_secret_basic"
  });
  assert.equal(client.token_endpoint_auth_method, "client_secret_basic");
  assert.ok(client.client_secret);
  const verifier = "test-verifier-123456789";
  const authorized = await oauth.authorizePost(
    new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://chat.openai.com/aip/callback",
      code_challenge: challenge(verifier),
      code_challenge_method: "S256",
      password: "secret"
    }).toString()
  );
  assert.equal(authorized.status, 302);
  const code = new URL(String(authorized.location)).searchParams.get("code");
  assert.ok(code);
  const basic = Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString("base64");
  const token = oauth.token(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://chat.openai.com/aip/callback",
      code_verifier: verifier
    }).toString(),
    `Basic ${basic}`
  );
  assert.equal(token.token_type, "Bearer");
});

test("authorization page preserves response_type for password form post", () => {
  const oauth = new OAuthServer("secret");
  const client = oauth.register({
    client_name: "ChatGPT",
    redirect_uris: ["https://chat.openai.com/aip/callback"]
  });
  const page = oauth.authorizePage(
    `http://127.0.0.1:3000/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "https://chat.openai.com/aip/callback",
      code_challenge: challenge("test-verifier-123456789"),
      code_challenge_method: "S256"
    })}`
  );
  assert.equal(page.status, 200);
  assert.match(page.html, /name="response_type" value="code"/);
});
