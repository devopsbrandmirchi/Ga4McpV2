export type AppErrorCode =
  | "not_connected"
  | "invalid_property"
  | "invalid_field"
  | "quota"
  | "revoked"
  | "unauthorized"
  | "validation"
  | "google_api"
  | "no_active_property"
  | "active_property_unavailable"
  | "property_not_accessible"
  | "operator_not_found"
  | "session_invalid";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(message: string, code: AppErrorCode, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

interface GoogleLikeError {
  code?: number | string;
  status?: number | string;
  message?: string;
  details?: unknown;
}

function asGoogleError(error: unknown): GoogleLikeError {
  if (error && typeof error === "object") {
    return error as GoogleLikeError;
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

function combinedMessage(error: GoogleLikeError): string {
  const parts = [error.message];
  if (typeof error.details === "string") {
    parts.push(error.details);
  }
  return parts.filter(Boolean).join(" ");
}

export function mapGoogleError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const googleError = asGoogleError(error);
  const numericCode =
    typeof googleError.code === "number"
      ? googleError.code
      : typeof googleError.status === "number"
        ? googleError.status
        : Number.parseInt(String(googleError.code ?? googleError.status ?? ""), 10);
  const message = combinedMessage(googleError);
  const lower = message.toLowerCase();

  if (
    lower.includes("invalid_grant") ||
    lower.includes("token has been expired or revoked") ||
    lower.includes("invalid refresh token")
  ) {
    return new AppError(
      "Google authorization has expired or been revoked. Reconnect this Google account through the Claude connector.",
      "revoked",
      401,
    );
  }

  if (numericCode === 401 || lower.includes("unauthenticated")) {
    return new AppError(
      "Google account is not connected. Complete the Google authorization flow from Claude.",
      "not_connected",
      401,
    );
  }

  if (
    numericCode === 403 &&
    (lower.includes("permission") ||
      lower.includes("access") ||
      lower.includes("not found") ||
      lower.includes("insufficient"))
  ) {
    return new AppError(
      "The specified GA4 property could not be accessed by the authenticated Google account.",
      "invalid_property",
      403,
    );
  }

  if (numericCode === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    return new AppError(
      "The Google Analytics API quota or rate limit was exceeded. Wait and try again.",
      "quota",
      429,
    );
  }

  const fieldMatch =
    message.match(/(?:metric|dimension)\s+['"`]([A-Za-z0-9_]+)['"`]/i) ??
    message.match(/['"`]([A-Za-z][A-Za-z0-9_]{2,})['"`]/);
  if (
    numericCode === 400 &&
    (lower.includes("metric") ||
      lower.includes("dimension") ||
      lower.includes("invalid argument") ||
      fieldMatch)
  ) {
    const field = fieldMatch?.[1];
    return new AppError(
      field
        ? `Google Analytics rejected the request because "${field}" is not a valid metric or dimension for this property.`
        : `Google Analytics rejected a metric or dimension in the request. ${message}`,
      "invalid_field",
      400,
    );
  }

  if (numericCode === 404 || lower.includes("property not found")) {
    return new AppError(
      "The specified GA4 property could not be accessed by the authenticated Google account.",
      "invalid_property",
      404,
    );
  }

  return new AppError(
    message || "The Google Analytics API request failed.",
    "google_api",
    Number.isFinite(numericCode) ? numericCode : 500,
  );
}

export function toToolErrorText(error: unknown): string {
  const mapped = mapGoogleError(error);
  return JSON.stringify({
    error: mapped.code,
    message: mapped.message,
  });
}
