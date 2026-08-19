import { randomUUID } from "node:crypto";
import type {
  ActivePropertyInput,
  OperatorRecord,
  OperatorStore,
  UpsertOperatorCredentialsInput,
} from "@/store/types";

function nowIso(): string {
  return new Date().toISOString();
}

export function createMemoryOperatorStore(
  seed: OperatorRecord[] = [],
): OperatorStore & { snapshot(): OperatorRecord[] } {
  const records = new Map<string, OperatorRecord>();
  for (const record of seed) {
    records.set(record.googleSub, { ...record });
  }

  return {
    async getByGoogleSub(googleSub: string) {
      const record = records.get(googleSub);
      return record ? { ...record } : undefined;
    },

    async upsertCredentials(input: UpsertOperatorCredentialsInput) {
      const existing = records.get(input.googleSub);
      const timestamp = nowIso();
      const next: OperatorRecord = {
        googleSub: input.googleSub,
        operatorId: existing?.operatorId ?? randomUUID(),
        email: input.email ?? existing?.email ?? null,
        encryptedRefreshToken: input.encryptedRefreshToken,
        tokenUpdatedAt: timestamp,
        activePropertyId: existing?.activePropertyId ?? null,
        activePropertyName: existing?.activePropertyName ?? null,
        activePropertyAccount: existing?.activePropertyAccount ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        lastAccessAt: timestamp,
      };
      records.set(input.googleSub, next);
      return { ...next };
    },

    async setActiveProperty(googleSub: string, property: ActivePropertyInput) {
      const existing = records.get(googleSub);
      if (!existing) {
        throw new Error(`Unknown operator: ${googleSub}`);
      }
      const timestamp = nowIso();
      const next: OperatorRecord = {
        ...existing,
        activePropertyId: property.propertyId,
        activePropertyName: property.propertyName,
        activePropertyAccount: property.account,
        updatedAt: timestamp,
        lastAccessAt: timestamp,
      };
      records.set(googleSub, next);
      return { ...next };
    },

    async clearActiveProperty(googleSub: string) {
      const existing = records.get(googleSub);
      if (!existing) {
        throw new Error(`Unknown operator: ${googleSub}`);
      }
      const timestamp = nowIso();
      const next: OperatorRecord = {
        ...existing,
        activePropertyId: null,
        activePropertyName: null,
        activePropertyAccount: null,
        updatedAt: timestamp,
        lastAccessAt: timestamp,
      };
      records.set(googleSub, next);
      return { ...next };
    },

    async touchLastAccess(googleSub: string) {
      const existing = records.get(googleSub);
      if (!existing) {
        return;
      }
      records.set(googleSub, {
        ...existing,
        lastAccessAt: nowIso(),
      });
    },

    snapshot() {
      return [...records.values()].map((record) => ({ ...record }));
    },
  };
}
