import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import type {
  ActivePropertyInput,
  OperatorRecord,
  OperatorStore,
  SessionPropertyRecord,
  UpsertOperatorCredentialsInput,
} from "@/store/types";
import { LEGACY_SESSION_ID, normalizeSessionId } from "@/store/types";

const COLLECTION = "operators";
const SESSIONS = "sessions";

function nowIso(): string {
  return new Date().toISOString();
}

function asRecord(googleSub: string, data: Record<string, unknown>): OperatorRecord {
  return {
    googleSub,
    operatorId: String(data.operatorId ?? ""),
    email: typeof data.email === "string" ? data.email : null,
    encryptedRefreshToken: String(data.encryptedRefreshToken ?? ""),
    tokenUpdatedAt: String(data.tokenUpdatedAt ?? ""),
    activePropertyId: typeof data.activePropertyId === "string" ? data.activePropertyId : null,
    activePropertyName:
      typeof data.activePropertyName === "string" ? data.activePropertyName : null,
    activePropertyAccount:
      typeof data.activePropertyAccount === "string" ? data.activePropertyAccount : null,
    createdAt: String(data.createdAt ?? ""),
    updatedAt: String(data.updatedAt ?? ""),
    lastAccessAt: String(data.lastAccessAt ?? ""),
  };
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

function asSessionRecord(
  sessionId: string,
  data: Record<string, unknown>,
): SessionPropertyRecord {
  return {
    sessionId,
    activePropertyId: typeof data.activePropertyId === "string" ? data.activePropertyId : null,
    activePropertyName:
      typeof data.activePropertyName === "string" ? data.activePropertyName : null,
    activePropertyAccount:
      typeof data.activePropertyAccount === "string" ? data.activePropertyAccount : null,
    updatedAt: String(data.updatedAt ?? ""),
  };
}

export function createFirestoreOperatorStore(dbFactory?: () => Firestore): OperatorStore {
  let client: Firestore | undefined;

  const db = () => {
    if (!client) {
      const config = getConfig();
      client = dbFactory
        ? dbFactory()
        : new Firestore({
            projectId: config.firestoreProjectId,
            ignoreUndefinedProperties: true,
          });
    }
    return client;
  };

  const operatorRef = (googleSub: string) => db().collection(COLLECTION).doc(googleSub);
  const sessionRef = (googleSub: string, sessionId: string) =>
    operatorRef(googleSub).collection(SESSIONS).doc(sessionId);

  return {
    async getByGoogleSub(googleSub: string) {
      const snapshot = await operatorRef(googleSub).get();
      if (!snapshot.exists) {
        return undefined;
      }
      return asRecord(googleSub, (snapshot.data() ?? {}) as Record<string, unknown>);
    },

    async upsertCredentials(input: UpsertOperatorCredentialsInput) {
      const ref = operatorRef(input.googleSub);
      return db().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const timestamp = nowIso();
        const existing = snapshot.exists
          ? ((snapshot.data() ?? {}) as Record<string, unknown>)
          : undefined;
        const nextToken = input.encryptedRefreshToken ?? String(existing?.encryptedRefreshToken ?? "");
        if (!nextToken) {
          throw new Error(`Cannot create operator ${input.googleSub} without a refresh token`);
        }
        const record: OperatorRecord = {
          googleSub: input.googleSub,
          operatorId: String(existing?.operatorId ?? randomUUID()),
          email: input.email ?? (typeof existing?.email === "string" ? existing.email : null),
          encryptedRefreshToken: nextToken,
          tokenUpdatedAt: input.encryptedRefreshToken
            ? timestamp
            : String(existing?.tokenUpdatedAt ?? timestamp),
          activePropertyId:
            typeof existing?.activePropertyId === "string" ? existing.activePropertyId : null,
          activePropertyName:
            typeof existing?.activePropertyName === "string" ? existing.activePropertyName : null,
          activePropertyAccount:
            typeof existing?.activePropertyAccount === "string"
              ? existing.activePropertyAccount
              : null,
          createdAt: String(existing?.createdAt ?? timestamp),
          updatedAt: timestamp,
          lastAccessAt: timestamp,
        };
        tx.set(ref, record);
        return record;
      });
    },

    async setActiveProperty(googleSub: string, property: ActivePropertyInput) {
      const ref = operatorRef(googleSub);
      return db().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) {
          throw new Error(`Unknown operator: ${googleSub}`);
        }
        const timestamp = nowIso();
        const current = asRecord(googleSub, (snapshot.data() ?? {}) as Record<string, unknown>);
        const next: OperatorRecord = {
          ...current,
          activePropertyId: property.propertyId,
          activePropertyName: property.propertyName,
          activePropertyAccount: property.account,
          updatedAt: timestamp,
          lastAccessAt: timestamp,
        };
        tx.set(ref, next);
        return next;
      });
    },

    async clearActiveProperty(googleSub: string) {
      const ref = operatorRef(googleSub);
      return db().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) {
          throw new Error(`Unknown operator: ${googleSub}`);
        }
        const timestamp = nowIso();
        const current = asRecord(googleSub, (snapshot.data() ?? {}) as Record<string, unknown>);
        const next: OperatorRecord = {
          ...current,
          activePropertyId: null,
          activePropertyName: null,
          activePropertyAccount: null,
          updatedAt: timestamp,
          lastAccessAt: timestamp,
        };
        tx.set(ref, next);
        return next;
      });
    },

    async getSessionProperty(googleSub: string, sessionId: string) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = await this.getByGoogleSub(googleSub);
        return operator ? sessionFromOperator(sid, operator) : undefined;
      }
      const snapshot = await sessionRef(googleSub, sid).get();
      if (!snapshot.exists) {
        return undefined;
      }
      return asSessionRecord(sid, (snapshot.data() ?? {}) as Record<string, unknown>);
    },

    async setSessionProperty(googleSub: string, sessionId: string, property: ActivePropertyInput) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = await this.setActiveProperty(googleSub, property);
        return sessionFromOperator(sid, operator);
      }
      const operator = await this.getByGoogleSub(googleSub);
      if (!operator) {
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
      await sessionRef(googleSub, sid).set(record);
      await operatorRef(googleSub).update({ lastAccessAt: timestamp });
      return record;
    },

    async clearSessionProperty(googleSub: string, sessionId: string) {
      const sid = normalizeSessionId(sessionId);
      if (sid === LEGACY_SESSION_ID) {
        const operator = await this.clearActiveProperty(googleSub);
        return sessionFromOperator(sid, operator);
      }
      const operator = await this.getByGoogleSub(googleSub);
      if (!operator) {
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
      await sessionRef(googleSub, sid).set(record);
      return record;
    },

    async touchLastAccess(googleSub: string) {
      const ref = operatorRef(googleSub);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return;
      }
      await ref.update({ lastAccessAt: nowIso() });
    },
  };
}
