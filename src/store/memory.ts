import { randomUUID } from "node:crypto";
import type {
  ActivePropertyInput,
  OperatorRecord,
  OperatorStore,
  SessionPropertyRecord,
  UpsertOperatorCredentialsInput,
} from "@/store/types";
import { LEGACY_SESSION_ID, normalizeSessionId } from "@/store/types";

function nowIso(): string {
  return new Date().toISOString();
}

function sessionFromOperator(
  sessionId: string,
  operator: OperatorRecord,
): SessionPropertyRecord {
  return {
    sessionId,
    activePropertyId: operator.activePropertyId,
    activePropertyName: operator.activePropertyName,
    activePropertyAccount: operator.activePropertyAccount,
    updatedAt: operator.updatedAt,
  };
}

export function createMemoryOperatorStore(
  seed: OperatorRecord[] = [],
): OperatorStore & {
  snapshot(): OperatorRecord[];
  snapshotSessions(): SessionPropertyRecord[];
} {
  const records = new Map<string, OperatorRecord>();
  const sessions = new Map<string, SessionPropertyRecord>();
  for (const record of seed) {
    records.set(record.googleSub, { ...record });
  }

  const sessionKey = (googleSub: string, sessionId: string) => `${googleSub}:${sessionId}`;

  return {
    async getByGoogleSub(googleSub: string) {
      const record = records.get(googleSub);
      return record ? { ...record } : undefined;
    },

    async upsertCredentials(input: UpsertOperatorCredentialsInput) {
      const existing = records.get(input.googleSub);
      const nextToken = input.encryptedRefreshToken ?? existing?.encryptedRefreshToken ?? "";
      if (!nextToken) {
        throw new Error(`Cannot create operator ${input.googleSub} without a refresh token`);
      }
      const timestamp = nowIso();
      const next: OperatorRecord = {
        googleSub: input.googleSub,
        operatorId: existing?.operatorId ?? randomUUID(),
        email: input.email ?? existing?.email ?? null,
        encryptedRefreshToken: nextToken,
        tokenUpdatedAt: input.encryptedRefreshToken
          ? timestamp
          : (existing?.tokenUpdatedAt ?? timestamp),
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

    async getSessionProperty(googleSub: string, sessionId: string) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = records.get(googleSub);
        return operator ? sessionFromOperator(sid, operator) : undefined;
      }
      const record = sessions.get(sessionKey(googleSub, sid));
      return record ? { ...record } : undefined;
    },

    async setSessionProperty(googleSub: string, sessionId: string, property: ActivePropertyInput) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = await this.setActiveProperty(googleSub, property);
        return sessionFromOperator(sid, operator);
      }
      const existing = records.get(googleSub);
      if (!existing) {
        throw new Error(`Unknown operator: ${googleSub}`);
      }
      const timestamp = nowIso();
      const record: SessionPropertyRecord = {
        sessionId: sid,
        activePropertyId: property.propertyId,
        activePropertyName: property.propertyName,
        activePropertyAccount: property.account,
        updatedAt: timestamp,
      };
      sessions.set(sessionKey(googleSub, sid), record);
      records.set(googleSub, { ...existing, lastAccessAt: timestamp });
      return { ...record };
    },

    async clearSessionProperty(googleSub: string, sessionId: string) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = await this.clearActiveProperty(googleSub);
        return sessionFromOperator(sid, operator);
      }
      const existing = records.get(googleSub);
      if (!existing) {
        throw new Error(`Unknown operator: ${googleSub}`);
      }
      const timestamp = nowIso();
      const record: SessionPropertyRecord = {
        sessionId: sid,
        activePropertyId: null,
        activePropertyName: null,
        activePropertyAccount: null,
        updatedAt: timestamp,
      };
      sessions.set(sessionKey(googleSub, sid), record);
      return { ...record };
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

    snapshotSessions() {
      return [...sessions.values()].map((record) => ({ ...record }));
    },
  };
}
