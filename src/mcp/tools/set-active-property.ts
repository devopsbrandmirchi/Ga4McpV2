import type { McpServer } from "@modelcontextprotocol/server";
import { setAuthorizedActiveProperty } from "@/google/properties";
import { toToolErrorText } from "@/lib/errors";
import { jsonToolResult, setActivePropertyInputSchema } from "@/mcp/tools/schemas";

export const SET_ACTIVE_PROPERTY_DESCRIPTION = `What it does: switches the authenticated operator's active GA4 property.

When to use: the user says "switch to Client B" or names another property. Always list properties first and only pass a propertyId from that list.

Required parameters: propertyId.

Returns: the newly active property. The change persists for later Claude sessions with the same Google account.

Limitations: the property must be accessible to the authenticated Google account. Arbitrary IDs are rejected.`;

export function registerSetActivePropertyTool(server: McpServer): void {
  server.registerTool(
    "ga4_set_active_property",
    {
      title: "Set active GA4 property",
      description: SET_ACTIVE_PROPERTY_DESCRIPTION,
      inputSchema: setActivePropertyInputSchema,
    },
    async ({ propertyId }) => {
      try {
        const property = await setAuthorizedActiveProperty(propertyId);
        return jsonToolResult({
          propertyId: property.propertyId,
          propertyName: property.propertyName,
          account: property.account,
          switched: true,
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
