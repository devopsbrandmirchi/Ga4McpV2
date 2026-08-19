import { createMcpHandler } from "mcp-handler";
import { logger } from "@/lib/logger";
import { createRequestId, runWithOperator } from "@/lib/request-context";
import { extractMcpToken, tryReadAccessToken } from "@/mcp/auth";
import {
  mcpOptionsResponse,
  mcpProbeGetResponse,
  toJsonRpcResponse,
  withStreamableAccept,
} from "@/mcp/http";
import { wwwAuthenticateHeader } from "@/mcp/oauth/metadata";
import { registerGetActivePropertyTool } from "@/mcp/tools/get-active-property";
import { registerGetOperatorTool } from "@/mcp/tools/get-operator";
import { registerListPropertiesTool } from "@/mcp/tools/list-properties";
import { registerMetadataTool } from "@/mcp/tools/metadata";
import { registerRealtimeTool } from "@/mcp/tools/realtime";
import { registerRunReportTool } from "@/mcp/tools/run-report";
import { registerSetActivePropertyTool } from "@/mcp/tools/set-active-property";
import { getOperatorStore } from "@/store/operators";

export function callsProtectedTool(
  body: unknown,
  mcpMethodHeader?: string | null,
): boolean {
  if (mcpMethodHeader === "tools/call") {
    return true;
  }

  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (
      message &&
      typeof message === "object" &&
      (message as { method?: unknown }).method === "tools/call"
    ) {
      return true;
    }
  }
  return false;
}

export function unauthorizedToolCallResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "invalid_token",
      error_description: "Authentication required",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": wwwAuthenticateHeader(),
      },
    },
  );
}

function createInnerHandler() {
  return createMcpHandler(
    (server) => {
      registerGetOperatorTool(server);
      registerListPropertiesTool(server);
      registerGetActivePropertyTool(server);
      registerSetActivePropertyTool(server);
      registerMetadataTool(server);
      registerRunReportTool(server);
      registerRealtimeTool(server);
    },
    {
      serverInfo: {
        name: "GA4 Analytics MCP V2",
        version: "2.0.0",
      },
      instructions:
        "This is a multi-operator GA4 connector. Identify the authenticated operator with ga4_get_operator, list properties with ga4_list_properties, select one with ga4_set_active_property if needed, then call ga4_get_metadata and ga4_run_report or ga4_run_realtime_report. Reports use the operator's active property unless an authorized propertyId is supplied. Dates are passed to GA4 unchanged.",
      onEvent: (event) => {
        if (event.type === "ERROR") {
          logger.error("MCP handler error", {
            source: event.source,
            severity: event.severity,
            context: event.context,
          });
        }
      },
    },
  );
}

function toolNameFromBody(body: unknown): string | undefined {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (message && typeof message === "object") {
      const params = (message as { params?: { name?: unknown } }).params;
      if (typeof params?.name === "string") {
        return params.name;
      }
    }
  }
  return undefined;
}

export function createGa4McpHandler() {
  const handler = createInnerHandler();

  return async (req: Request): Promise<Response> => {
    const requestId = createRequestId(req);
    const started = Date.now();

    if (req.method === "OPTIONS") {
      return mcpOptionsResponse();
    }
    if (req.method === "GET") {
      return mcpProbeGetResponse();
    }
    if (req.method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (req.method === "POST") {
      const token = extractMcpToken(req);
      const payload = tryReadAccessToken(token);
      let body: unknown;
      try {
        body = await req.clone().json();
      } catch {
        body = undefined;
      }

      const mcpOperation = toolNameFromBody(body) ?? "mcp";

      if (callsProtectedTool(body, req.headers.get("mcp-method"))) {
        if (!payload?.sub) {
          logger.warn("Unauthorized MCP tool call", { requestId, mcpOperation, success: false });
          return unauthorizedToolCallResponse();
        }

        const operator = await getOperatorStore().getByGoogleSub(payload.sub);
        if (!operator) {
          logger.warn("Unknown operator for MCP token", { requestId, mcpOperation, success: false });
          return unauthorizedToolCallResponse();
        }

        void getOperatorStore().touchLastAccess(operator.googleSub);

        return runWithOperator(
          {
            requestId,
            operatorId: operator.operatorId,
            googleSub: operator.googleSub,
          },
          async () => {
            try {
              const response = await toJsonRpcResponse(await handler(withStreamableAccept(req)));
              logger.info("MCP tool call", {
                requestId,
                operatorId: operator.operatorId,
                mcpOperation,
                success: response.ok,
                durationMs: Date.now() - started,
              });
              return response;
            } catch (error) {
              logger.error("MCP tool call failed", {
                requestId,
                operatorId: operator.operatorId,
                mcpOperation,
                success: false,
                errorCategory: error instanceof Error ? error.name : "unknown",
                durationMs: Date.now() - started,
              });
              throw error;
            }
          },
        );
      }
    }

    return toJsonRpcResponse(await handler(withStreamableAccept(req)));
  };
}
