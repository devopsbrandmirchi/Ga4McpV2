import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptRefreshToken } from "@/lib/crypto";
import { runWithOperator } from "@/lib/request-context";
import { createMemoryOperatorStore } from "@/store/memory";
import { setOperatorStore } from "@/store/operators";
import { setRequiredEnv } from "@/test/env";

const propertiesBySub: Record<string, Array<{ propertyId: string; propertyName: string; account: string; propertyType: string }>> = {
  "sub-a": [
    { propertyId: "1001", propertyName: "Property A", account: "Account A", propertyType: "PROPERTY_TYPE_ORDINARY" },
    { propertyId: "1002", propertyName: "Property B", account: "Account A", propertyType: "PROPERTY_TYPE_ORDINARY" },
  ],
  "sub-b": [
    { propertyId: "2001", propertyName: "Property C", account: "Account B", propertyType: "PROPERTY_TYPE_ORDINARY" },
    { propertyId: "2002", propertyName: "Property D", account: "Account B", propertyType: "PROPERTY_TYPE_ORDINARY" },
  ],
};

vi.mock("@/google/admin", () => ({
  listGa4Properties: async () => {
    const { getOperatorContext } = await import("@/lib/request-context");
    return propertiesBySub[getOperatorContext().googleSub] ?? [];
  },
}));

describe("property authorization", () => {
  beforeEach(async () => {
    setRequiredEnv();
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      email: "operator-a@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//a"),
    });
    await store.setActiveProperty("sub-a", {
      propertyId: "1001",
      propertyName: "Property A",
      account: "Account A",
    });
    await store.upsertCredentials({
      googleSub: "sub-b",
      email: "operator-b@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//b"),
    });
    await store.setActiveProperty("sub-b", {
      propertyId: "2001",
      propertyName: "Property C",
      account: "Account B",
    });
    setOperatorStore(store);
  });

  it("uses the stored active property and rejects another operator's property", async () => {
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
      async () => {
        const active = await resolveAuthorizedProperty();
        expect(active.propertyId).toBe("1001");
        await expect(resolveAuthorizedProperty("2001")).rejects.toMatchObject({
          code: "property_not_accessible",
        });
      },
    );
  });

  it("switches only after the live allow-list check", async () => {
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    const { getOperatorStore } = await import("@/store/operators");
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
      async () => {
        const switched = await resolveAuthorizedProperty("1002");
        expect(switched.propertyId).toBe("1002");
      },
    );
    const stored = await getOperatorStore().getByGoogleSub("sub-a");
    expect(stored?.activePropertyId).toBe("1002");
  });

  it("clears a stored property that is no longer accessible", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//a"),
    });
    await store.setActiveProperty("sub-a", {
      propertyId: "9999",
      propertyName: "Gone",
      account: "Account A",
    });
    setOperatorStore(store);
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
      async () => {
        await expect(resolveAuthorizedProperty()).rejects.toMatchObject({
          code: "active_property_unavailable",
        });
      },
    );
    expect((await store.getByGoogleSub("sub-a"))?.activePropertyId).toBeNull();
  });

  it("does not overwrite another session's property on the same Google account", async () => {
    const { resolveAuthorizedProperty } = await import("@/google/properties");
    const { getOperatorStore } = await import("@/store/operators");
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a", sessionId: "sid-a" },
      async () => {
        const switched = await resolveAuthorizedProperty("1002");
        expect(switched.propertyId).toBe("1002");
      },
    );
    await runWithOperator(
      { requestId: "r2", operatorId: "op-a", googleSub: "sub-a", sessionId: "sid-b" },
      async () => {
        const active = await resolveAuthorizedProperty();
        expect(active.propertyId).toBe("1001");
      },
    );
    const store = getOperatorStore();
    expect((await store.getSessionProperty("sub-a", "sid-a"))?.activePropertyId).toBe("1002");
    expect((await store.getByGoogleSub("sub-a"))?.activePropertyId).toBe("1001");
  });
});
