import { describe, expect, it } from "vitest";
import { normalizeRows } from "@/google/analytics";

describe("normalizeRows", () => {
  it("maps dimension and metric values", () => {
    const rows = normalizeRows(
      [
        {
          dimensionValues: [{ value: "US" }],
          metricValues: [{ value: "12" }],
        },
      ],
      ["country"],
      ["activeUsers"],
    );
    expect(rows).toEqual([{ country: "US", activeUsers: 12 }]);
  });
});
