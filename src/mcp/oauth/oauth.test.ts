import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getAuthorize } from "@/app/oauth/mcp/authorize/route";
import { POST as postRegister } from "@/app/oauth/mcp/register/route";
import { POST as postToken } from "@/app/oauth/mcp/token/route";
import { GET as getAsMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as getPrm } from "@/app/.well-known/oauth-protected-resource/mcp/route";
import {
  CLAUDE_AI_CALLBACK,
  isRedirectAllowed,
  redirectUriMatches,
} from "@/mcp/oauth/clients";
import { authorizationServerMetadata, protectedResourceMetadata } from "@/mcp/oauth/metadata";
import { issueAccessToken, readAccessToken } from "@/mcp/oauth/tokens";
import { isAuthorizedToken } from "@/mcp/auth";
import { createGa4McpHandler, unauthorizedMcpResponse } from "@/mcp/server";
import { encryptRefreshToken } from "@/lib/crypto";
import { createMemoryOperatorStore } from "@/store/memory";
import { setOperatorStore } from "@/store/operators";
import { setRequiredEnv } from "@/test/env";

function formRequest(url: string, fields: Record<string, string>, headers?: HeadersInit): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}

async function registerClient(): Promise<string> {
  const register = await postRegister(
    new Request("http://localhost:3000/oauth/mcp/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [CLAUDE_AI_CALLBACK],
        token_endpoint_auth_method: "none",
      }),
    }),
  );
  const registration = (await register.json()) as { client_id: string };
  expect(register.status).toBe(201);
  return registration.client_id;
}

describe("MCP OAuth metadata", () => {
  beforeEach(() => {
    setRequiredEnv();
  });

  it("advertises the exact /mcp resource and CIMD-capable authorization server", async () => {
    const prm = protectedResourceMetadata();
    expect(prm.resource).toBe("http://localhost:3000/mcp");
    expect(prm.authorization_servers).toEqual(["http://localhost:3000"]);

    const as = authorizationServerMetadata();
    expect(as.client_id_metadata_document_supported).toBe(true);
    expect(as.token_endpoint_auth_methods_supported).toContain("none");
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.authorization_endpoint).toBe("http://localhost:3000/oauth/mcp/authorize");

    const prmResponse = await getPrm().json();
    const asResponse = await getAsMetadata().json();
    expect(prmResponse.resource).toBe(prm.resource);
    expect(asResponse.issuer).toBe(as.issuer);
  });
});

describe("CIMD redirect allowlist", () => {
  it("matches Claude.ai exactly and loopback redirects without the port", () => {
    expect(
      isRedirectAllowed(
        {
          clientId: "https://claude.ai/oauth/client",
          redirectUris: [CLAUDE_AI_CALLBACK],
          tokenEndpointAuthMethod: "none",
          displayHost: "claude.ai",
        },
        CLAUDE_AI_CALLBACK,
      ),
    ).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1/callback", "http://127.0.0.1:3118/callback")).toBe(
      true,
    );
    expect(redirectUriMatches(CLAUDE_AI_CALLBACK, "https://evil.example/callback")).toBe(false);
  });
});

describe("authorize + token", () => {
  beforeEach(() => {
    setRequiredEnv();
    const store = createMemoryOperatorStore();
    setOperatorStore(store);
  });

  it("redirects MCP authorize to Google instead of a shared setup token", async () => {
    const clientId = await registerClient();
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = await getAuthorize(
      new Request(
        `http://localhost:3000/oauth/mcp/authorize?response_type=code&client_id=${encodeURIComponent(
          clientId,
        )}&redirect_uri=${encodeURIComponent(
          CLAUDE_AI_CALLBACK,
        )}&code_challenge=${challenge}&code_challenge_method=S256&state=claude-state`,
      ),
    );
    expect(authorize.status).toBe(302);
    expect(authorize.headers.get("location")).toContain("accounts.google.com");
    expect(authorize.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it("issues an MCP access token bound to the Google subject", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "google-sub-a",
      email: "operator-a@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//a"),
    });
    setOperatorStore(store);

    const clientId = await registerClient();
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const { issueAuthorizationCode } = await import("@/mcp/oauth/tokens");
    const code = issueAuthorizationCode({
      clientId,
      redirectUri: CLAUDE_AI_CALLBACK,
      codeChallenge: challenge,
      sub: "google-sub-a",
      sid: "session-one",
    });

    const token = await postToken(
      formRequest("http://localhost:3000/oauth/mcp/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_AI_CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
      }),
    );
    const body = (await token.json()) as { access_token: string; refresh_token: string };
    expect(token.status).toBe(200);
    await expect(isAuthorizedToken(body.access_token)).resolves.toBe(true);
    expect(readAccessToken(body.access_token).sub).toBe("google-sub-a");
    expect(readAccessToken(body.access_token).sid).toBe("session-one");

    const refreshed = await postToken(
      formRequest("http://localhost:3000/oauth/mcp/token", {
        grant_type: "refresh_token",
        refresh_token: body.refresh_token,
        client_id: clientId,
      }),
    );
    const refreshedBody = (await refreshed.json()) as { access_token: string };
    expect(readAccessToken(refreshedBody.access_token).sub).toBe("google-sub-a");
    expect(readAccessToken(refreshedBody.access_token).sid).toBe("session-one");
  });

  it("keeps legacy tokens without a session id working", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "google-sub-a",
      email: "operator-a@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//a"),
    });
    setOperatorStore(store);

    const clientId = await registerClient();
    const verifier = "b".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const { issueAuthorizationCode } = await import("@/mcp/oauth/tokens");
    const code = issueAuthorizationCode({
      clientId,
      redirectUri: CLAUDE_AI_CALLBACK,
      codeChallenge: challenge,
      sub: "google-sub-a",
    });

    const token = await postToken(
      formRequest("http://localhost:3000/oauth/mcp/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: CLAUDE_AI_CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
      }),
    );
    const body = (await token.json()) as { access_token: string };
    expect(readAccessToken(body.access_token).sub).toBe("google-sub-a");
    expect(readAccessToken(body.access_token).sid).toBeUndefined();
  });

  it("does not accept a static shared MCP token", async () => {
    await expect(isAuthorizedToken("test-mcp-token-secret")).resolves.toBe(false);
    expect(issueAccessToken({ clientId: "x", sub: "google-sub-a" })).not.toContain(
      "personal-operator",
    );
  });
});

describe("MCP OAuth discovery", () => {
  beforeEach(() => {
    setRequiredEnv();
  });

  it("returns 401 with resource metadata so Claude detects Always required", async () => {
    const handler = createGa4McpHandler();
    const unauthorized = unauthorizedMcpResponse();
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("WWW-Authenticate")).toContain(
      "resource_metadata=\"http://localhost:3000/.well-known/oauth-protected-resource/mcp\"",
    );

    const probe = await handler(new Request("http://localhost:3000/mcp", { method: "GET" }));
    expect(probe.status).toBe(401);
    expect(probe.headers.get("WWW-Authenticate")).toContain("resource_metadata=");

    const initialize = await handler(
      new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(initialize.status).toBe(401);
    expect(initialize.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });
});
