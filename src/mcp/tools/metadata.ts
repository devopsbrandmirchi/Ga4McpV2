import type { McpServer } from "@modelcontextprotocol/server";
import { getPropertyMetadata } from "@/google/analytics";
import { resolveAuthorizedProperty } from "@/google/properties";
import { toToolErrorText } from "@/lib/errors";
import { jsonToolResult, metadataInputSchema } from "@/mcp/tools/schemas";

export const METADATA_DESCRIPTION = `What it does: returns available GA4 dimensions and metrics for the active property, or another authorized property if propertyId is supplied.

When to use: before ga4_run_report or ga4_run_realtime_report when you are unsure of valid API names.

Optional parameters: propertyId. If omitted, uses the operator's active property. If supplied and different, switches the active property after authorization.

Returns: apiName, uiName, description, category, and whether the field is custom.

Limitations: metadata is property-specific. Common report names include activeUsers, sessions, keyEvents, date, country, sessionSource, landingPagePlusQueryString.`;

export function registerMetadataTool(server: McpServer): void {
  server.registerTool(
    "ga4_get_metadata",
    {
      title: "Get GA4 metadata",
      description: METADATA_DESCRIPTION,
      inputSchema: metadataInputSchema,
    },
    async ({ propertyId }) => {
      try {
        const property = await resolveAuthorizedProperty(propertyId);
        const metadata = await getPropertyMetadata(property.propertyId);
        return jsonToolResult(metadata);
      } catch (error) {
        return {
          content: [{ type: "text", text: toToolErrorText(error) }],
          isError: true,
        };
      }
    },
  );
}
