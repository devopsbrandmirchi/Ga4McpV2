import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import { getConfig } from "@/lib/config";
import type {
  ActivePropertyInput,
  OperatorRecord,
  OperatorStore,
  UpsertOperatorCredentialsInput,
} from "@/store/types";

const COLLECTION = "operators";

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

  return {
    async getByGoogleSub(googleSub: string) {
      const snapshot = await db().collection(COLLECTION).doc(googleSub).get();
      if (!snapshot.exists) {
        return undefined;
      }
      return asRecord(googleSub, (snapshot.data() ?? {}) as Record<string, unknown>);
    },

    async upsertCredentials(input: UpsertOperatorCredentialsInput) {
      const ref = db().collection(COLLECTION).doc(input.googleSub);
      return db().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const timestamp = nowIso();
        const existing = snapshot.exists
          ? ((snapshot.data() ?? {}) as Record<string, unknown>)
          : undefined;
        const record: OperatorRecord = {
          googleSub: input.googleSub,
          operatorId: String(existing?.operatorId ?? randomUUID()),
          email: input.email ?? (typeof existing?.email === "string" ? existing.email : null),
          encryptedRefreshToken: input.encryptedRefreshToken,
          tokenUpdatedAt: timestamp,
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
      const ref = db().collection(COLLECTION).doc(googleSub);
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
      const ref = db().collection(COLLECTION).doc(googleSub);
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

    async touchLastAccess(googleSub: string) {
      const ref = db().collection(COLLECTION).doc(googleSub);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return;
      }
      await ref.update({ lastAccessAt: nowIso() });
    },
  };
}
