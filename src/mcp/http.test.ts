import { describe, expect, it } from "vitest";
import { parseSseJsonPayload, withStreamableAccept } from "@/mcp/http";

describe("streamable HTTP helpers", () => {
  it("injects Accept when the client omitted SSE", () => {
    const req = withStreamableAccept(new Request("http://localhost:3000/mcp"));
    expect(req.headers.get("accept")).toContain("text/event-stream");
    expect(req.headers.get("accept")).toContain("application/json");
  });

  it("unwraps an SSE JSON-RPC payload", () => {
    expect(parseSseJsonPayload('data: {"jsonrpc":"2.0","id":1}\n\n')).toBe(
      '{"jsonrpc":"2.0","id":1}',
    );
  });
});
