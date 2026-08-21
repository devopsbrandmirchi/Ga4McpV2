import { getAuthorizedClientForOperator } from "@/google/auth";
import { listGa4PropertiesWithAuth } from "@/google/admin";
import { AppError, toHttpStatus } from "@/lib/errors";
import { escapeHtml, htmlResponse, pageHtml } from "@/lib/html";
import { logger } from "@/lib/logger";
import {
  clearOAuthCookieHeaders,
  readOAuthCookies,
  requestIsHttps,
} from "@/lib/oauth-cookies";
import { normalizePropertyId } from "@/lib/property-id";
import { mcpAuthorizeRedirectUrl } from "@/mcp/oauth/complete";
import { assertPendingMcpAuthorize } from "@/mcp/oauth/pending";
import { getOperatorStore } from "@/store/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appendCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
}

export async function POST(req: Request) {
  const secure = requestIsHttps(req);
  const cookies = readOAuthCookies(req);

  try {
    const pending = assertPendingMcpAuthorize(cookies.pending);
    if (
      !cookies.operator?.googleSub ||
      !cookies.operator.sessionId ||
      cookies.operator.exp < Date.now()
    ) {
      throw new AppError(
        "The Google authorization session expired. Start the Claude connector again.",
        "session_invalid",
        401,
      );
    }

    const form = await req.formData();
    const requested = String(form.get("propertyId") ?? "");
    const propertyId = normalizePropertyId(requested);
    const auth = await getAuthorizedClientForOperator(cookies.operator.googleSub);
    const properties = await listGa4PropertiesWithAuth(auth);
    const selected = properties.find((property) => property.propertyId === propertyId);
    if (!selected) {
      throw new AppError(
        "The requested GA4 property is not accessible to the authenticated Google account.",
        "property_not_accessible",
        403,
      );
    }

    await getOperatorStore().setSessionProperty(
      cookies.operator.googleSub,
      cookies.operator.sessionId,
      {
        propertyId: selected.propertyId,
        propertyName: selected.propertyName,
        account: selected.account,
      },
    );

    logger.info("Operator selected initial GA4 property", {
      sessionId: cookies.operator.sessionId,
      propertyId: selected.propertyId,
    });

    const headers = new Headers({
      Location: mcpAuthorizeRedirectUrl(
        pending,
        cookies.operator.googleSub,
        cookies.operator.sessionId,
      ),
    });
    appendCookies(headers, clearOAuthCookieHeaders(secure));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Property selection failed.";
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    appendCookies(headers, clearOAuthCookieHeaders(secure));
    return htmlResponse(
      pageHtml(
        "Property selection failed",
        `<h1>Property selection failed</h1><p class="error">${escapeHtml(message)}</p><p>Return to Claude and connect the connector again.</p>`,
      ),
      error instanceof AppError ? toHttpStatus(error.status, 500) : 400,
      headers,
    );
  }
}
