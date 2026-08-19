import { z } from "zod";
import { isGa4Date } from "@/lib/dates";
import { normalizePropertyId } from "@/lib/property-id";

export const propertyIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      try {
        normalizePropertyId(value);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: "Use a numeric GA4 property ID such as 123456789.",
    },
  );

export const optionalPropertyIdSchema = propertyIdSchema.optional();

export const ga4DateSchema = z.string().refine(isGa4Date, {
  message:
    "Use an ISO date (YYYY-MM-DD) or a GA4 relative value such as today, yesterday, or 30daysAgo.",
});

export const apiNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z][A-Za-z0-9_]*$/,
    "Use a GA4 API name such as activeUsers or country.",
  );

export const dateRangeSchema = z.object({
  startDate: ga4DateSchema,
  endDate: ga4DateSchema,
});

const numericValueSchema = z.object({
  int64Value: z.string().optional(),
  doubleValue: z.number().optional(),
});

const filterSchema = z.object({
  fieldName: apiNameSchema,
  stringFilter: z
    .object({
      matchType: z
        .enum([
          "MATCH_TYPE_UNSPECIFIED",
          "EXACT",
          "BEGINS_WITH",
          "ENDS_WITH",
          "CONTAINS",
          "FULL_REGEXP",
          "PARTIAL_REGEXP",
        ])
        .optional(),
      value: z.string(),
      caseSensitive: z.boolean().optional(),
    })
    .optional(),
  inListFilter: z
    .object({
      values: z.array(z.string()).min(1),
      caseSensitive: z.boolean().optional(),
    })
    .optional(),
  numericFilter: z
    .object({
      operation: z.enum([
        "OPERATION_UNSPECIFIED",
        "EQUAL",
        "LESS_THAN",
        "LESS_THAN_OR_EQUAL",
        "GREATER_THAN",
        "GREATER_THAN_OR_EQUAL",
      ]),
      value: numericValueSchema,
    })
    .optional(),
  betweenFilter: z
    .object({
      fromValue: numericValueSchema,
      toValue: numericValueSchema,
    })
    .optional(),
});

export const filterExpressionSchema: z.ZodType = z.lazy(() =>
  z.object({
    andGroup: z
      .object({
        expressions: z.array(filterExpressionSchema),
      })
      .optional(),
    orGroup: z
      .object({
        expressions: z.array(filterExpressionSchema),
      })
      .optional(),
    notExpression: filterExpressionSchema.optional(),
    filter: filterSchema.optional(),
  }),
);

export const orderBySchema = z.object({
  desc: z.boolean().optional(),
  dimension: z
    .object({
      dimensionName: apiNameSchema,
      orderType: z
        .enum([
          "ORDER_TYPE_UNSPECIFIED",
          "ALPHANUMERIC",
          "CASE_INSENSITIVE_ALPHANUMERIC",
          "NUMERIC",
        ])
        .optional(),
    })
    .optional(),
  metric: z
    .object({
      metricName: apiNameSchema,
    })
    .optional(),
});

export const metadataInputSchema = z.object({
  propertyId: optionalPropertyIdSchema,
});

export const runReportInputSchema = z.object({
  propertyId: optionalPropertyIdSchema,
  dateRanges: z.array(dateRangeSchema).min(1).max(4),
  dimensions: z.array(apiNameSchema).max(9).default([]),
  metrics: z.array(apiNameSchema).min(1).max(10),
  dimensionFilter: filterExpressionSchema.optional(),
  metricFilter: filterExpressionSchema.optional(),
  orderBys: z.array(orderBySchema).max(10).optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
  offset: z.number().int().min(0).max(100000).default(0),
});

export const realtimeReportInputSchema = z.object({
  propertyId: optionalPropertyIdSchema,
  dimensions: z.array(apiNameSchema).max(9).default([]),
  metrics: z.array(apiNameSchema).min(1).max(10),
  dimensionFilter: filterExpressionSchema.optional(),
  metricFilter: filterExpressionSchema.optional(),
  limit: z.number().int().min(1).max(10000).default(1000),
});

export const setActivePropertyInputSchema = z.object({
  propertyId: propertyIdSchema,
});

export function jsonToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
