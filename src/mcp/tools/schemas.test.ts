import { describe, expect, it } from "vitest";
import { runReportInputSchema, setActivePropertyInputSchema } from "@/mcp/tools/schemas";

describe("tool schemas", () => {
  it("allows omitting propertyId on reports", () => {
    const parsed = runReportInputSchema.parse({
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      metrics: ["activeUsers"],
    });
    expect(parsed.propertyId).toBeUndefined();
  });

  it("requires a numeric property ID to switch", () => {
    expect(() => setActivePropertyInputSchema.parse({ propertyId: "not-a-property" })).toThrow();
    expect(setActivePropertyInputSchema.parse({ propertyId: "123456789" }).propertyId).toBe(
      "123456789",
    );
  });
});
