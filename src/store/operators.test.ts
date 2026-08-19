import { beforeEach, describe, expect, it } from "vitest";
import { encryptRefreshToken } from "@/lib/crypto";
import { createMemoryOperatorStore } from "@/store/memory";
import { setRequiredEnv } from "@/test/env";

describe("memory operator store isolation", () => {
  beforeEach(() => {
    setRequiredEnv();
  });

  it("never returns another operator's credentials", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      email: "operator-a@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//token-a"),
    });
    await store.upsertCredentials({
      googleSub: "sub-b",
      email: "operator-b@example.com",
      encryptedRefreshToken: encryptRefreshToken("1//token-b"),
    });

    const a = await store.getByGoogleSub("sub-a");
    const b = await store.getByGoogleSub("sub-b");
    expect(a?.email).toBe("operator-a@example.com");
    expect(b?.email).toBe("operator-b@example.com");
    expect(a?.encryptedRefreshToken).not.toBe(b?.encryptedRefreshToken);
    expect(await store.getByGoogleSub("sub-c")).toBeUndefined();
  });

  it("persists an active property per operator", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//token-a"),
    });
    await store.setActiveProperty("sub-a", {
      propertyId: "1002",
      propertyName: "Property B",
      account: "Account A",
    });
    const later = await store.getByGoogleSub("sub-a");
    expect(later?.activePropertyId).toBe("1002");
    expect(later?.activePropertyName).toBe("Property B");
  });
});
