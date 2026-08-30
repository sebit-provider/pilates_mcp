import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { URLSearchParams } from "node:url";

type ClientRecord = {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  scope?: string;
  token_endpoint_auth_method: "none" | "client_secret_post" | "client_secret_basic";
};

type AuthCodeRecord = {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource?: string;
  expiresAt: number;
};

type TokenRecord = {
  accessToken: string;
  refreshToken: string;
  client_id: string;
  scope: string;
  resource?: string;
  expiresAt: number;
};

const scopes = ["mcp:read", "mcp:write"];
const codes = new Map<string, AuthCodeRecord>();
const tokens = new Map<string, TokenRecord>();
const refreshTokens = new Map<string, TokenRecord>();
const clients = new Map<string, ClientRecord>();

export class OAuthServer {
  constructor(private readonly password = process.env.PILATES_MCP_OAUTH_PASSWORD) {}

  authRequired(): boolean {
    return process.env.PILATES_MCP_AUTH_DISABLED !== "true";
  }

  metadata(request: http.IncomingMessage) {
    const base = externalBaseUrl(request);
    return {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: scopes
    };
  }

  protectedResourceMetadata(request: http.IncomingMessage) {
    const base = externalBaseUrl(request);
    return {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      scopes_supported: scopes,
      resource_documentation: `${base}/tools`
    };
  }

  challenge(request: http.IncomingMessage): string {
    const base = externalBaseUrl(request);
    return `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="${scopes.join(" ")}"`;
  }

  verifyRequest(request: http.IncomingMessage): { ok: true } | { ok: false; message: string } {
    if (!this.authRequired()) return { ok: true };
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return { ok: false, message: "Missing bearer token" };
    const accessToken = header.slice("Bearer ".length).trim();
    const token = tokens.get(accessToken);
    if (!token) return { ok: false, message: "Invalid bearer token" };
    if (token.expiresAt <= Date.now()) return { ok: false, message: "Expired bearer token" };
    return { ok: true };
  }

  register(input: Record<string, unknown>): ClientRecord & { client_id_issued_at: number; client_secret_expires_at: number } {
    const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [];
    if (redirectUris.length === 0) throw new Error("redirect_uris is required");
    const requestedAuthMethod = typeof input.token_endpoint_auth_method === "string" ? input.token_endpoint_auth_method : "none";
    const tokenEndpointAuthMethod =
      requestedAuthMethod === "client_secret_post" || requestedAuthMethod === "client_secret_basic" ? requestedAuthMethod : "none";
    const client: ClientRecord = {
      client_id: `client_${randomToken(18)}`,
      client_secret: tokenEndpointAuthMethod === "none" ? undefined : randomToken(32),
      client_name: typeof input.client_name === "string" ? input.client_name : "MCP Client",
      redirect_uris: redirectUris,
      scope: typeof input.scope === "string" ? input.scope : scopes.join(" "),
      token_endpoint_auth_method: tokenEndpointAuthMethod
    };
    clients.set(client.client_id, client);
    return { ...client, client_id_issued_at: Math.floor(Date.now() / 1000), client_secret_expires_at: 0 };
  }

  authorizePage(requestUrl: string): { status: number; html: string } {
    const url = new URL(requestUrl);
    const validation = this.validateAuthorizeParams(url.searchParams);
    if (validation) return { status: 400, html: page("OAuth request error", `<p>${escapeHtml(validation)}</p>`) };
    if (!this.password) {
      return {
        status: 503,
        html: page("OAuth setup required", "<p>Set PILATES_MCP_OAUTH_PASSWORD in Railway variables before connecting ChatGPT.</p>")
      };
    }
    return {
      status: 200,
      html: page(
        "Authorize pilates_mcp",
        `<form method="post" action="/authorize">
          ${hidden("response_type", url.searchParams.get("response_type"))}
          ${hidden("client_id", url.searchParams.get("client_id"))}
          ${hidden("redirect_uri", url.searchParams.get("redirect_uri"))}
          ${hidden("state", url.searchParams.get("state"))}
          ${hidden("scope", url.searchParams.get("scope") ?? scopes.join(" "))}
          ${hidden("resource", url.searchParams.get("resource"))}
          ${hidden("code_challenge", url.searchParams.get("code_challenge"))}
          ${hidden("code_challenge_method", url.searchParams.get("code_challenge_method") ?? "S256")}
          <label>Connection password <input type="password" name="password" autocomplete="current-password" autofocus></label>
          <button type="submit">Authorize</button>
        </form>`
      )
    };
  }

  async authorizePost(body: string): Promise<{ status: number; location?: string; html?: string }> {
    const form = new URLSearchParams(body);
    if (!this.password) return { status: 503, html: page("OAuth setup required", "<p>Set PILATES_MCP_OAUTH_PASSWORD.</p>") };
    if (!safeEqual(String(form.get("password") ?? ""), this.password)) {
      return { status: 401, html: page("Unauthorized", "<p>Invalid connection password.</p>") };
    }
    const validation = this.validateAuthorizeParams(form);
    if (validation) return { status: 400, html: page("OAuth request error", `<p>${escapeHtml(validation)}</p>`) };

    const code = randomToken(32);
    codes.set(code, {
      code,
      client_id: required(form, "client_id"),
      redirect_uri: required(form, "redirect_uri"),
      code_challenge: required(form, "code_challenge"),
      code_challenge_method: form.get("code_challenge_method") ?? "S256",
      scope: form.get("scope") ?? scopes.join(" "),
      resource: form.get("resource") ?? undefined,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    const redirect = new URL(required(form, "redirect_uri"));
    redirect.searchParams.set("code", code);
    const state = form.get("state");
    if (state) redirect.searchParams.set("state", state);
    return { status: 302, location: redirect.toString() };
  }

  token(body: string, authorizationHeader?: string): Record<string, unknown> {
    const form = new URLSearchParams(body);
    const grant = form.get("grant_type");
    if (grant === "authorization_code") return this.authorizationCodeToken(form, authorizationHeader);
    if (grant === "refresh_token") return this.refreshTokenGrant(form, authorizationHeader);
    throw new Error("unsupported_grant_type");
  }

  private authorizationCodeToken(form: URLSearchParams, authorizationHeader?: string): Record<string, unknown> {
    const code = required(form, "code");
    const record = codes.get(code);
    if (!record) throw new Error("invalid_grant");
    codes.delete(code);
    if (record.expiresAt <= Date.now()) throw new Error("expired_code");
    const clientId = form.get("client_id") ?? basicCredentials(authorizationHeader)?.clientId;
    if (clientId !== record.client_id) throw new Error("invalid_client");
    if (required(form, "redirect_uri") !== record.redirect_uri) throw new Error("invalid_grant");
    if (record.code_challenge_method !== "S256") throw new Error("unsupported_code_challenge_method");
    if (pkceChallenge(required(form, "code_verifier")) !== record.code_challenge) throw new Error("invalid_grant");
    const client = clients.get(record.client_id);
    this.verifyClientAuthentication(client, form, authorizationHeader);
    return issueToken(record.client_id, record.scope, record.resource);
  }

  private refreshTokenGrant(form: URLSearchParams, authorizationHeader?: string): Record<string, unknown> {
    const refresh = required(form, "refresh_token");
    const existing = refreshTokens.get(refresh);
    if (!existing) throw new Error("invalid_grant");
    this.verifyClientAuthentication(clients.get(existing.client_id), form, authorizationHeader);
    refreshTokens.delete(refresh);
    tokens.delete(existing.accessToken);
    return issueToken(existing.client_id, existing.scope, existing.resource);
  }

  private verifyClientAuthentication(client: ClientRecord | undefined, form: URLSearchParams, authorizationHeader?: string): void {
    if (!client || client.token_endpoint_auth_method === "none") return;
    if (client.token_endpoint_auth_method === "client_secret_post") {
      if (form.get("client_secret") !== client.client_secret) throw new Error("invalid_client");
      return;
    }
    const credentials = basicCredentials(authorizationHeader);
    if (!credentials || credentials.clientId !== client.client_id || credentials.clientSecret !== client.client_secret) {
      throw new Error("invalid_client");
    }
  }

  private validateAuthorizeParams(params: URLSearchParams): string | null {
    if (params.get("response_type") !== "code") return "response_type=code is required";
    for (const key of ["client_id", "redirect_uri", "code_challenge"]) {
      if (!params.get(key)) return `${key} is required`;
    }
    if ((params.get("code_challenge_method") ?? "S256") !== "S256") return "Only S256 PKCE is supported";
    const client = clients.get(required(params, "client_id"));
    if (client && !client.redirect_uris.includes(required(params, "redirect_uri"))) return "redirect_uri is not registered";
    return null;
  }
}

function issueToken(client_id: string, scope: string, resource?: string): Record<string, unknown> {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const token: TokenRecord = {
    accessToken,
    refreshToken,
    client_id,
    scope,
    resource,
    expiresAt: Date.now() + 60 * 60 * 1000
  };
  tokens.set(accessToken, token);
  refreshTokens.set(refreshToken, token);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope
  };
}

function externalBaseUrl(request: http.IncomingMessage): string {
  const configured = process.env.PILATES_MCP_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  const proto = String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim();
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "127.0.0.1:3000";
  return `${proto}://${String(host).split(",")[0].trim()}`;
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function required(params: URLSearchParams, key: string): string {
  const value = params.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function basicCredentials(header?: string): { clientId: string; clientSecret: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return {
    clientId: decodeURIComponent(decoded.slice(0, separator)),
    clientSecret: decodeURIComponent(decoded.slice(separator + 1))
  };
}

function hidden(name: string, value: string | null): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value ?? "")}">`;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif; background: #f7f7f7; color: #202124; }
    main { width: min(440px, calc(100vw - 32px)); background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 24px; }
    h1 { margin: 0 0 16px; font-size: 22px; }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 6px; font-size: 14px; }
    input { height: 38px; border: 1px solid #c8c8c8; border-radius: 6px; padding: 0 10px; font: inherit; }
    button { height: 40px; border: 0; border-radius: 6px; background: #202124; color: #fff; font: inherit; font-weight: 700; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
