import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not write tokens, codes, cookies, or client secrets", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logger.error("oauth", {
      refresh_token: "1//secret-refresh",
      access_token: "ya29.secret-access",
      id_token: "header.payload.sig",
      client_secret: "super-secret",
      authorization: "Bearer mcp-token",
      code: "4/authorization-code",
      code_verifier: "pkce-verifier",
      cookie: "ga4_oauth_state=abc",
      note: "ok",
    });

    const printed = String(error.mock.calls[0]?.[0]);
    expect(printed).toContain("[REDACTED]");
    expect(printed).toContain("ok");
    expect(printed).not.toContain("1//secret-refresh");
    expect(printed).not.toContain("ya29.secret-access");
    expect(printed).not.toContain("super-secret");
    expect(printed).not.toContain("mcp-token");
    expect(printed).not.toContain("4/authorization-code");
    expect(printed).not.toContain("pkce-verifier");
    expect(printed).not.toContain("ga4_oauth_state=abc");
  });
});
