import { listGa4Properties, type Ga4PropertySummary } from "@/google/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { normalizePropertyId } from "@/lib/property-id";
import { getOperatorContext, getSessionId } from "@/lib/request-context";
import { getOperatorStore } from "@/store/operators";
import { LEGACY_SESSION_ID } from "@/store/types";
import type { OperatorRecord, SessionPropertyRecord } from "@/store/types";

function findProperty(
  properties: Ga4PropertySummary[],
  propertyId: string,
): Ga4PropertySummary | undefined {
  const normalized = normalizePropertyId(propertyId);
  return properties.find((property) => property.propertyId === normalized);
}

export async function loadCurrentOperator(): Promise<OperatorRecord> {
  const { googleSub } = getOperatorContext();
  const operator = await getOperatorStore().getByGoogleSub(googleSub);
  if (!operator) {
    throw new AppError(
      "The authenticated operator was not found. Reconnect Google from Claude.",
      "operator_not_found",
      401,
    );
  }
  return operator;
}

export async function loadActiveProperty(): Promise<SessionPropertyRecord> {
  const { googleSub } = getOperatorContext();
  const sessionId = getSessionId();
  const session = await getOperatorStore().getSessionProperty(googleSub, sessionId);
  if (session?.activePropertyId) {
    return session;
  }

  const operator = await loadCurrentOperator();
  if (sessionId !== LEGACY_SESSION_ID && operator.activePropertyId) {
    return {
      sessionId,
      activePropertyId: operator.activePropertyId,
      activePropertyName: operator.activePropertyName,
      activePropertyAccount: operator.activePropertyAccount,
      updatedAt: operator.updatedAt,
    };
  }

  return (
    session ?? {
      sessionId,
      activePropertyId: operator.activePropertyId,
      activePropertyName: operator.activePropertyName,
      activePropertyAccount: operator.activePropertyAccount,
      updatedAt: operator.updatedAt,
    }
  );
}

export async function listAccessibleProperties(): Promise<
  Array<Ga4PropertySummary & { isActive: boolean }>
> {
  const active = await loadActiveProperty();
  const properties = await listGa4Properties();
  return properties.map((property) => ({
    ...property,
    isActive: active.activePropertyId === property.propertyId,
  }));
}

export async function persistActiveProperty(property: Ga4PropertySummary): Promise<SessionPropertyRecord> {
  const { googleSub, operatorId } = getOperatorContext();
  const updated = await getOperatorStore().setSessionProperty(googleSub, getSessionId(), {
    propertyId: property.propertyId,
    propertyName: property.propertyName,
    account: property.account,
  });
  logger.info("Active GA4 property updated", {
    operatorId,
    sessionId: updated.sessionId,
    propertyId: property.propertyId,
  });
  return updated;
}

export async function clearUnavailableActiveProperty(): Promise<void> {
  const { googleSub, operatorId } = getOperatorContext();
  const sessionId = getSessionId();
  await getOperatorStore().clearSessionProperty(googleSub, sessionId);
  logger.warn("Cleared unavailable active GA4 property", { operatorId, sessionId });
}

export async function resolveAuthorizedProperty(
  requestedPropertyId?: string,
): Promise<Ga4PropertySummary> {
  const active = await loadActiveProperty();
  const properties = await listGa4Properties();

  if (requestedPropertyId) {
    const selected = findProperty(properties, requestedPropertyId);
    if (!selected) {
      throw new AppError(
        "The requested GA4 property is not accessible to the authenticated Google account.",
        "property_not_accessible",
        403,
      );
    }
    if (active.activePropertyId !== selected.propertyId) {
      await persistActiveProperty(selected);
    }
    return selected;
  }

  if (!active.activePropertyId) {
    throw new AppError(
      "No active GA4 property is selected. Call ga4_list_properties, then ga4_set_active_property.",
      "no_active_property",
      400,
    );
  }

  const current = findProperty(properties, active.activePropertyId);
  if (!current) {
    await clearUnavailableActiveProperty();
    throw new AppError(
      "The previously selected GA4 property is no longer accessible. Call ga4_list_properties and select another property.",
      "active_property_unavailable",
      409,
    );
  }

  return current;
}

export async function setAuthorizedActiveProperty(
  propertyId: string,
): Promise<Ga4PropertySummary> {
  return resolveAuthorizedProperty(propertyId);
}
