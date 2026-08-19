import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptRefreshToken } from "@/lib/crypto";
import { runWithOperator } from "@/lib/request-context";
import { issueAccessToken, readAccessToken } from "@/mcp/oauth/tokens";
import { createGa4McpHandler } from "@/mcp/server";
import { createMemoryOperatorStore } from "@/store/memory";
import { setOperatorStore } from "@/store/operators";
import { setRequiredEnv } from "@/test/env";

const credentialsSeen: string[] = [];

vi.mock("@/google/auth", async () => {
  const actual = await vi.importActual<typeof import("@/google/auth")>("@/google/auth");
  return {
    ...actual,
    getAuthorizedClient: async () => {
      const { getOperatorContext } = await import("@/lib/request-context");
      const { decryptRefreshToken } = await import("@/lib/crypto");
      const { getOperatorStore } = await import("@/store/operators");
      const { googleSub } = getOperatorContext();
      const operator = await getOperatorStore().getByGoogleSub(googleSub);
      if (!operator) {
        throw new Error("missing operator");
      }
      const token = decryptRefreshToken(operator.encryptedRefreshToken);
      credentialsSeen.push(`${googleSub}:${token}`);
      return { credentials: { refresh_token: token } };
    },
  };
});

vi.mock("@/google/admin", () => ({
  listGa4Properties: async () => {
    const { getOperatorContext } = await import("@/lib/request-context");
    const sub = getOperatorContext().googleSub;
    if (sub === "sub-a") {
      return [
        { propertyId: "1001", propertyName: "Property A", account: "Account A", propertyType: "X" },
        { propertyId: "1002", propertyName: "Property B", account: "Account A", propertyType: "X" },
      ];
    }
    return [
      { propertyId: "2001", propertyName: "Property C", account: "Account B", propertyType: "X" },
      { propertyId: "2002", propertyName: "Property D", account: "Account B", propertyType: "X" },
    ];
  },
  listGa4PropertiesWithAuth: async () => [],
}));

describe("multi-operator isolation", () => {
  beforeEach(async () => {
    setRequiredEnv();
    credentialsSeen.length = 0;
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      email: "operator-a@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//token-a"),
    });
    await store.setActiveProperty("sub-a", {
      propertyId: "1001",
      propertyName: "Property A",
      account: "Account A",
    });
    await store.upsertCredentials({
      googleSub: "sub-b",
      email: "operator-b@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//token-b"),
    });
    await store.setActiveProperty("sub-b", {
      propertyId: "2001",
      propertyName: "Property C",
      account: "Account B",
    });
    setOperatorStore(store);
  });

  it("binds MCP tokens to distinct Google subjects", () => {
    const tokenA = issueAccessToken({ clientId: "claude-a", sub: "sub-a" });
    const tokenB = issueAccessToken({ clientId: "claude-b", sub: "sub-b" });
    expect(readAccessToken(tokenA).sub).toBe("sub-a");
    expect(readAccessToken(tokenB).sub).toBe("sub-b");
    expect(tokenA).not.toBe(tokenB);
  });

  it("does not mix credentials under concurrent tool authorization", async () => {
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    await Promise.all([
      runWithOperator({ requestId: "r-a", operatorId: "op-a", googleSub: "sub-a" }, async () => {
        const property = await resolveAuthorizedProperty();
        expect(property.propertyId).toBe("1001");
      }),
      runWithOperator({ requestId: "r-b", operatorId: "op-b", googleSub: "sub-b" }, async () => {
        const property = await resolveAuthorizedProperty();
        expect(property.propertyId).toBe("2001");
      }),
    ]);
  });

  it("rejects Operator A selecting Operator B's property", async () => {
    const { setAuthorizedActiveProperty } = await import("@/google/properties");
    await runWithOperator({ requestId: "r-a", operatorId: "op-a", googleSub: "sub-a" }, async () => {
      await expect(setAuthorizedActiveProperty("2001")).rejects.toMatchObject({
        code: "property_not_accessible",
      });
    });
  });

  it("keeps the selected property after a later session for the same Google subject", async () => {
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    await runWithOperator({ requestId: "r1", operatorId: "op-a", googleSub: "sub-a" }, async () => {
      await resolveAuthorizedProperty("1002");
    });
    await runWithOperator({ requestId: "r2", operatorId: "op-a", googleSub: "sub-a" }, async () => {
      const active = await resolveAuthorizedProperty();
      expect(active.propertyId).toBe("1002");
    });
  });

  it("requires a valid operator-bound MCP token for tools/call", async () => {
    const handler = createGa4McpHandler();
    const unauthorized = await handler(
      new Request("http://localhost:3000/ga4mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "ga4_list_properties", arguments: {} },
        }),
      }),
    );
    expect(unauthorized.status).toBe(401);

    const tokenA = issueAccessToken({ clientId: "claude", sub: "sub-a" });
    const tokenB = issueAccessToken({ clientId: "claude", sub: "missing-operator" });
    const unknown = await handler(
      new Request("http://localhost:3000/ga4mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "ga4_list_properties", arguments: {} },
        }),
      }),
    );
    expect(unknown.status).toBe(401);

    const authorized = await handler(
      new Request("http://localhost:3000/ga4mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }),
      }),
    );
    expect(authorized.status).not.toBe(401);
  });
});
