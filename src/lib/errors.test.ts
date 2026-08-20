import { describe, expect, it } from "vitest";
import { AppError, mapGoogleError } from "@/lib/errors";

describe("mapGoogleError", () => {
  it("maps missing authorization", () => {
    const error = mapGoogleError({ code: 401, message: "Unauthenticated" });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("not_connected");
    expect(error.message).toMatch(/not connected/i);
  });

  it("maps revoked refresh tokens", () => {
    const error = mapGoogleError({
      message: "invalid_grant: Token has been expired or revoked.",
    });
    expect(error.code).toBe("revoked");
    expect(error.message).not.toMatch(/ya29|1\/\//);
  });

  it("maps inaccessible properties", () => {
    const error = mapGoogleError({
      code: 403,
      message: "Caller does not have permission to access this property",
    });
    expect(error.code).toBe("invalid_property");
  });

  it("maps invalid metrics and dimensions", () => {
    const metricError = mapGoogleError({
      code: 400,
      message: "Field metric 'notARealMetric' is invalid",
    });
    expect(metricError.code).toBe("invalid_field");
    expect(metricError.message).toContain("notARealMetric");
  });

  it("maps quota errors", () => {
    const error = mapGoogleError({
      code: 429,
      message: "Quota exceeded for quota metric",
    });
    expect(error.code).toBe("quota");
  });

  it("does not copy Google gRPC codes into HTTP Response status", () => {
    const permissionDenied = mapGoogleError({
      code: 7,
      message: "The caller does not have permission",
    });
    expect(permissionDenied.code).toBe("google_api");
    expect(permissionDenied.status).toBeGreaterThanOrEqual(200);
    expect(permissionDenied.status).toBeLessThanOrEqual(599);
    expect(permissionDenied.status).not.toBe(7);

    const internal = mapGoogleError({
      code: 13,
      message: "Internal error from Analytics Admin API",
    });
    expect(internal.status).toBe(500);
  });
});
