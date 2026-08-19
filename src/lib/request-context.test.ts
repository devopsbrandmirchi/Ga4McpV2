import { describe, expect, it } from "vitest";
import { getOperatorContext, runWithOperator } from "@/lib/request-context";

describe("operator context", () => {
  it("fails closed when no operator is bound", () => {
    expect(() => getOperatorContext()).toThrow(/No authenticated operator/);
  });

  it("isolates concurrent operators", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithOperator(
        { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          seen.push(getOperatorContext().googleSub);
        },
      ),
      runWithOperator(
        { requestId: "r2", operatorId: "op-b", googleSub: "sub-b" },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          seen.push(getOperatorContext().googleSub);
        },
      ),
    ]);
    expect(seen).toEqual(expect.arrayContaining(["sub-a", "sub-b"]));
    expect(new Set(seen).size).toBe(2);
  });
});
