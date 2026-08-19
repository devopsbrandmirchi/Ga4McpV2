import type { McpServer } from "@modelcontextprotocol/server";
import { protos } from "@google-analytics/data";
import { runGa4RealtimeReport } from "@/google/analytics";
import { resolveAuthorizedProperty } from "@/google/properties";
import { toToolErrorText } from "@/lib/errors";
import { jsonToolResult, realtimeReportInputSchema } from "@/mcp/tools/schemas";

type IFilterExpression = protos.google.analytics.data.v1beta.IFilterExpression;

export const REALTIME_DESCRIPTION = `What it does: queries GA4 realtime data for approximately the last 30 minutes on the operator's authorized active property.

When to use: "How many users are on the site right now?", current locations, pages being viewed now.

Required parameters: metrics.
Optional parameters: propertyId (defaults to the active property; supplying another authorized ID switches then queries), dimensions, dimensionFilter, metricFilter, limit (default 1000, max 10000).

Returns: a clean table of current rows. There are no dateRanges.

Limitations: smaller field set than standard reports. Common realtime names: activeUsers, eventCount, keyEvents, country, city, unifiedScreenName, deviceCategory. For historical questions use ga4_run_report. Never invent a property ID.`;

export function registerRealtimeTool(server: McpServer): void {
  server.registerTool(
    "ga4_run_realtime_report",
    {
      title: "Run GA4 realtime report",
      description: REALTIME_DESCRIPTION,
      inputSchema: realtimeReportInputSchema,
    },
    async (input) => {
      try {
        const property = await resolveAuthorizedProperty(input.propertyId);
        const report = await runGa4RealtimeReport({
          propertyId: property.propertyId,
          dimensions: input.dimensions,
          metrics: input.metrics,
          dimensionFilter: input.dimensionFilter as IFilterExpression | undefined,
          metricFilter: input.metricFilter as IFilterExpression | undefined,
          limit: input.limit,
        });
        return jsonToolResult(report);
      } catch (error) {
        return {
          content: [{ type: "text", text: toToolErrorText(error) }],
          isError: true,
        };
      }
    },
  );
}
