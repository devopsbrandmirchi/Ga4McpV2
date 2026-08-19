import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listAccessibleProperties } from "@/google/properties";
import { toToolErrorText } from "@/lib/errors";
import { jsonToolResult } from "@/mcp/tools/schemas";

export const LIST_PROPERTIES_DESCRIPTION = `What it does: lists GA4 properties the authenticated Google account can access and marks the active property.

When to use: first call when the user says "my site", "my analytics", or wants to switch clients/properties.

Required parameters: none.

Returns: propertyName, numeric propertyId, account, propertyType, and isActive. Use ga4_set_active_property to switch.

Limitations: only properties visible to the authenticated Google account. Does not return OAuth credentials.`;

export function registerListPropertiesTool(server: McpServer): void {
  server.registerTool(
    "ga4_list_properties",
    {
      title: "List GA4 properties",
      description: LIST_PROPERTIES_DESCRIPTION,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const properties = await listAccessibleProperties();
        return jsonToolResult({
          properties,
          count: properties.length,
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
