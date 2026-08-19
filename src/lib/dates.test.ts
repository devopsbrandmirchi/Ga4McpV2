import { describe, expect, it } from "vitest";
import { isGa4Date } from "@/lib/dates";

describe("isGa4Date", () => {
  it("accepts ISO and relative GA4 dates", () => {
    expect(isGa4Date("2026-08-19")).toBe(true);
    expect(isGa4Date("today")).toBe(true);
    expect(isGa4Date("yesterday")).toBe(true);
    expect(isGa4Date("30daysAgo")).toBe(true);
    expect(isGa4Date("last week")).toBe(false);
  });
});
