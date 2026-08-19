import {
  exchangeAuthorizationCode,
  getAuthorizedClientForOperator,
  persistGoogleIdentity,
  verifyOAuthState,
} from "@/google/auth";
import { listGa4PropertiesWithAuth, type Ga4PropertySummary } from "@/google/admin";
import { AppError } from "@/lib/errors";
import { escapeHtml, htmlResponse, pageHtml } from "@/lib/html";
import { logger } from "@/lib/logger";
import {
  clearOAuthCookieHeaders,
  operatorCookieHeader,
  readOAuthCookies,
  requestIsHttps,
} from "@/lib/oauth-cookies";
import { mcpAuthorizeRedirectUrl } from "@/mcp/oauth/complete";
import { assertPendingMcpAuthorize } from "@/mcp/oauth/pending";
import { getOperatorStore } from "@/store/operators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function propertyPickerHtml(params: {
  properties: Ga4PropertySummary[];
  email: string | null;
  error?: string;
}): string {
  const options = params.properties
    .map(
      (property) =>
        `<option value="${escapeHtml(property.propertyId)}">${escapeHtml(
          property.propertyName,
        )} — ${escapeHtml(property.account)} (${escapeHtml(property.propertyId)})</option>`,
    )
    .join("");

  return pageHtml(
    "Select a GA4 property",
    `
      <h1>Select the GA4 property Claude should use</h1>
      <p>Signed in${params.email ? ` as <code>${escapeHtml(params.email)}</code>` : ""}.</p>
      <p>You can switch later from Claude if this Google account has access to more than one property.</p>
      ${params.error ? `<p class="error">${escapeHtml(params.error)}</p>` : ""}
      <form method="post" action="/oauth/google/select-property">
        <label for="propertyId">GA4 property</label>
        <select id="propertyId" name="propertyId" required>
          ${options}
        </select>
        <button type="submit">Continue</button>
      </form>
    `,
  );
}

function appendCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const secure = requestIsHttps(req);
  const cookies = readOAuthCookies(req);

    if (oauthError) {
    const deniedHeaders = new Headers();
    appendCookies(deniedHeaders, clearOAuthCookieHeaders(secure));
    return htmlResponse(
      pageHtml(
        "Google authorization denied",
        `<h1>Google authorization denied</h1><p class="error">${escapeHtml(
          oauthError,
        )}</p><p>Return to Claude and connect the connector again.</p>`,
      ),
      400,
      deniedHeaders,
    );
  }

  try {
    const pending = assertPendingMcpAuthorize(cookies.pending);
    if (!code || !state || !cookies.state || !cookies.verifier) {
      throw new AppError("The Google authorization response is incomplete.", "session_invalid", 400);
    }
    if (state !== cookies.state) {
      throw new AppError("OAuth state did not match.", "unauthorized", 401);
    }
    verifyOAuthState(state);

    const identity = await exchangeAuthorizationCode({
      code,
      codeVerifier: cookies.verifier,
    });
    const operator = await persistGoogleIdentity(identity);
    const auth = await getAuthorizedClientForOperator(identity.googleSub);
    const properties = await listGa4PropertiesWithAuth(auth);

    logger.info("Google OAuth completed", {
      operatorId: operator.operatorId,
      propertyCount: properties.length,
    });

    if (properties.length === 0) {
      const emptyHeaders = new Headers();
      appendCookies(emptyHeaders, clearOAuthCookieHeaders(secure));
      return htmlResponse(
        pageHtml(
          "No GA4 properties",
          `<h1>No GA4 properties</h1><p class="error">This Google account does not have access to any GA4 properties.</p><p>Grant access in Google Analytics and start the Claude connector again.</p>`,
        ),
        403,
        emptyHeaders,
      );
    }

    const stillAccessible =
      operator.activePropertyId &&
      properties.some((property) => property.propertyId === operator.activePropertyId);

    if (properties.length === 1) {
      const only = properties[0];
      if (only) {
        await getOperatorStore().setActiveProperty(identity.googleSub, {
          propertyId: only.propertyId,
          propertyName: only.propertyName,
          account: only.account,
        });
      }
    } else if (!stillAccessible) {
      const headers = new Headers({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      headers.append("Set-Cookie", operatorCookieHeader({ googleSub: identity.googleSub, secure }));
      return htmlResponse(
        propertyPickerHtml({
          properties,
          email: identity.email,
          error: operator.activePropertyId
            ? "The previously selected property is no longer accessible. Choose another."
            : undefined,
        }),
        200,
        headers,
      );
    }

    const headers = new Headers({
      Location: mcpAuthorizeRedirectUrl(pending, identity.googleSub),
    });
    appendCookies(headers, clearOAuthCookieHeaders(secure));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google authorization failed.";
    logger.error("Google OAuth callback failed", {
      errorCategory: error instanceof AppError ? error.code : "google_oauth",
    });
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    appendCookies(headers, clearOAuthCookieHeaders(secure));
    return htmlResponse(
      pageHtml(
        "Google authorization failed",
        `<h1>Google authorization failed</h1><p class="error">${escapeHtml(message)}</p>`,
      ),
      error instanceof AppError ? error.status : 400,
      headers,
    );
  }
}
