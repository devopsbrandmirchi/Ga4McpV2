import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { loadActiveProperty } from "@/google/properties";
import { AppError, toToolErrorText } from "@/lib/errors";
import { jsonToolResult } from "@/mcp/tools/schemas";

export const GET_ACTIVE_PROPERTY_DESCRIPTION = `What it does: returns the operator's currently selected GA4 property.

When to use: before running a report if you need to confirm which client/property is active.

Required parameters: none.

Returns: propertyId, propertyName, and account, or an error if none is selected.`;

export function registerGetActivePropertyTool(server: McpServer): void {
  server.registerTool(
    "ga4_get_active_property",
    {
      title: "Get active GA4 property",
      description: GET_ACTIVE_PROPERTY_DESCRIPTION,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const active = await loadActiveProperty();
        if (!active.activePropertyId) {
          throw new AppError(
            "No active GA4 property is selected. Call ga4_list_properties, then ga4_set_active_property.",
            "no_active_property",
            400,
          );
        }
        return jsonToolResult({
          propertyId: active.activePropertyId,
          propertyName: active.activePropertyName,
          account: active.activePropertyAccount,
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
