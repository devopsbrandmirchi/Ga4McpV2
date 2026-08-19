import { describe, expect, it } from "vitest";
import { normalizePropertyId, toPropertyResourceName } from "@/lib/property-id";

describe("property IDs", () => {
  it("normalizes numeric and resource names", () => {
    expect(normalizePropertyId("123456789")).toBe("123456789");
    expect(normalizePropertyId("properties/123456789")).toBe("123456789");
    expect(toPropertyResourceName("123456789")).toBe("properties/123456789");
  });

  it("rejects arbitrary strings", () => {
    expect(() => normalizePropertyId("client-b")).toThrow(/Invalid GA4 property ID/);
  });
});
