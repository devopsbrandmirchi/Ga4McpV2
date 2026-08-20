import { describe, expect, it } from "vitest";
import { htmlResponse } from "@/lib/html";

describe("htmlResponse", () => {
  it("rejects gRPC-style status codes instead of throwing RangeError", async () => {
    const response = htmlResponse("<p>failed</p>", 7);
    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toContain("failed");
  });
});
