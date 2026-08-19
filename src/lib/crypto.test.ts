import { beforeEach, describe, expect, it } from "vitest";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/crypto";
import { setRequiredEnv } from "@/test/env";

describe("token encryption", () => {
  beforeEach(() => {
    setRequiredEnv();
  });

  it("round-trips a refresh token without logging it", () => {
    const encrypted = encryptRefreshToken("1//operator-refresh");
    expect(encrypted).not.toContain("1//operator-refresh");
    expect(decryptRefreshToken(encrypted)).toBe("1//operator-refresh");
  });
});
