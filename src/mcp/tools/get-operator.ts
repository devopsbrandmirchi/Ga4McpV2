import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadCurrentOperator } from "@/google/properties";
import { toToolErrorText } from "@/lib/errors";
import { peekOperatorContext } from "@/lib/request-context";
import { jsonToolResult } from "@/mcp/tools/schemas";

export const GET_OPERATOR_DESCRIPTION = `What it does: returns the authenticated operator for this Claude connector session.

When to use: to confirm which Google account is connected before listing or switching GA4 properties.

Required parameters: none.

Returns: operatorId, email, and connected=true. Never returns tokens or credentials.`;

export function registerGetOperatorTool(server: McpServer): void {
  server.registerTool(
    "ga4_get_operator",
    {
      title: "Get authenticated operator",
      description: GET_OPERATOR_DESCRIPTION,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const operator = await loadCurrentOperator();
        const context = peekOperatorContext();
        return jsonToolResult({
          operatorId: operator.operatorId,
          email: operator.email,
          connected: true,
          requestId: context?.requestId,
        });
      } catch (error) {
        return {
          content: [{ type: "text", text: toToolErrorText(error) }],
          isError: true,
        };
      }
    },
  );
}
