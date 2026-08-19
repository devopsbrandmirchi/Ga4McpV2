import { beforeEach, describe, expect, it } from "vitest";
import { extractMcpToken, isAuthorizedToken } from "@/mcp/auth";
import { issueAccessToken } from "@/mcp/oauth/tokens";
import { setRequiredEnv } from "@/test/env";

describe("MCP token extraction", () => {
  beforeEach(() => {
    setRequiredEnv();
  });

  it("reads a Bearer token and rejects missing/static tokens", async () => {
    const access = issueAccessToken({ clientId: "claude", sub: "sub-a" });
    const req = new Request("http://localhost:3000/mcp", {
      headers: { Authorization: `Bearer ${access}` },
    });
    expect(extractMcpToken(req)).toBe(access);
    await expect(isAuthorizedToken(access)).resolves.toBe(true);
    await expect(isAuthorizedToken(undefined)).resolves.toBe(false);
    await expect(isAuthorizedToken("not-a-jwt")).resolves.toBe(false);
  });
});
