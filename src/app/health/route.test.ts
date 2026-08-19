import { describe, expect, it } from "vitest";
import { GET } from "@/app/health/route";

describe("health", () => {
  it("returns ok", async () => {
    const response = GET();
    await expect(response.json()).resolves.toMatchObject({ status: "ok", version: "2.0.0" });
  });
});
