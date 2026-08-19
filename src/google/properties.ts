import { listGa4Properties, type Ga4PropertySummary } from "@/google/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { normalizePropertyId } from "@/lib/property-id";
import { getOperatorContext } from "@/lib/request-context";
import { getOperatorStore } from "@/store/operators";
import type { OperatorRecord } from "@/store/types";

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

export async function listAccessibleProperties(): Promise<
  Array<Ga4PropertySummary & { isActive: boolean }>
> {
  const operator = await loadCurrentOperator();
  const properties = await listGa4Properties();
  return properties.map((property) => ({
    ...property,
    isActive: operator.activePropertyId === property.propertyId,
  }));
}

export async function persistActiveProperty(property: Ga4PropertySummary): Promise<OperatorRecord> {
  const { googleSub, operatorId } = getOperatorContext();
  const updated = await getOperatorStore().setActiveProperty(googleSub, {
    propertyId: property.propertyId,
    propertyName: property.propertyName,
    account: property.account,
  });
  logger.info("Active GA4 property updated", {
    operatorId,
    propertyId: property.propertyId,
  });
  return updated;
}

export async function clearUnavailableActiveProperty(): Promise<void> {
  const { googleSub, operatorId } = getOperatorContext();
  await getOperatorStore().clearActiveProperty(googleSub);
  logger.warn("Cleared unavailable active GA4 property", { operatorId });
}

export async function resolveAuthorizedProperty(
  requestedPropertyId?: string,
): Promise<Ga4PropertySummary> {
  const operator = await loadCurrentOperator();
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
    if (operator.activePropertyId !== selected.propertyId) {
      await persistActiveProperty(selected);
    }
    return selected;
  }

  if (!operator.activePropertyId) {
    throw new AppError(
      "No active GA4 property is selected. Call ga4_list_properties, then ga4_set_active_property.",
      "no_active_property",
      400,
    );
  }

  const active = findProperty(properties, operator.activePropertyId);
  if (!active) {
    await clearUnavailableActiveProperty();
    throw new AppError(
      "The previously selected GA4 property is no longer accessible. Call ga4_list_properties and select another property.",
      "active_property_unavailable",
      409,
    );
  }

  return active;
}

export async function setAuthorizedActiveProperty(
  propertyId: string,
): Promise<Ga4PropertySummary> {
  return resolveAuthorizedProperty(propertyId);
}
