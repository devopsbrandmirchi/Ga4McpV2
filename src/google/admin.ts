import { v1beta } from "@google-analytics/admin";
import type { OAuth2Client } from "google-auth-library";
import { getAuthorizedClient } from "@/google/auth";
import { mapGoogleError } from "@/lib/errors";
import { normalizePropertyId } from "@/lib/property-id";

export interface Ga4PropertySummary {
  propertyName: string;
  propertyId: string;
  account: string;
  propertyType: string;
}

export function createAdminClient(auth: OAuth2Client): v1beta.AnalyticsAdminServiceClient {
  return new v1beta.AnalyticsAdminServiceClient({
    authClient: auth as never,
  });
}

export async function listGa4Properties(
  clientFactory: (
    auth: OAuth2Client,
  ) => v1beta.AnalyticsAdminServiceClient = createAdminClient,
): Promise<Ga4PropertySummary[]> {
  try {
    const auth = await getAuthorizedClient();
    const client = clientFactory(auth);
    const properties: Ga4PropertySummary[] = [];

    for await (const summary of client.listAccountSummariesAsync()) {
      for (const property of summary.propertySummaries ?? []) {
        if (!property.property) {
          continue;
        }
        properties.push({
          propertyName: property.displayName ?? "Untitled property",
          propertyId: normalizePropertyId(property.property),
          account: summary.displayName ?? "Untitled account",
          propertyType: String(property.propertyType ?? "PROPERTY_TYPE_ORDINARY"),
        });
      }
    }

    return properties;
  } catch (error) {
    throw mapGoogleError(error);
  }
}

export async function listGa4PropertiesWithAuth(
  auth: OAuth2Client,
  clientFactory: (
    authClient: OAuth2Client,
  ) => v1beta.AnalyticsAdminServiceClient = createAdminClient,
): Promise<Ga4PropertySummary[]> {
  try {
    const client = clientFactory(auth);
    const properties: Ga4PropertySummary[] = [];

    for await (const summary of client.listAccountSummariesAsync()) {
      for (const property of summary.propertySummaries ?? []) {
        if (!property.property) {
          continue;
        }
        properties.push({
          propertyName: property.displayName ?? "Untitled property",
          propertyId: normalizePropertyId(property.property),
          account: summary.displayName ?? "Untitled account",
          propertyType: String(property.propertyType ?? "PROPERTY_TYPE_ORDINARY"),
        });
      }
    }

    return properties;
  } catch (error) {
    throw mapGoogleError(error);
  }
}
