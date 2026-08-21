export const LEGACY_SESSION_ID = "legacy";

export interface OperatorRecord {
  googleSub: string;
  operatorId: string;
  email: string | null;
  encryptedRefreshToken: string;
  tokenUpdatedAt: string;
  activePropertyId: string | null;
  activePropertyName: string | null;
  activePropertyAccount: string | null;
  createdAt: string;
  updatedAt: string;
  lastAccessAt: string;
}

export interface UpsertOperatorCredentialsInput {
  googleSub: string;
  email?: string | null;
  encryptedRefreshToken?: string;
}

export interface ActivePropertyInput {
  propertyId: string;
  propertyName: string;
  account: string;
}

export interface SessionPropertyRecord {
  sessionId: string;
  activePropertyId: string | null;
  activePropertyName: string | null;
  activePropertyAccount: string | null;
  updatedAt: string;
}

export interface OperatorStore {
  getByGoogleSub(googleSub: string): Promise<OperatorRecord | undefined>;
  upsertCredentials(input: UpsertOperatorCredentialsInput): Promise<OperatorRecord>;
  setActiveProperty(googleSub: string, property: ActivePropertyInput): Promise<OperatorRecord>;
  clearActiveProperty(googleSub: string): Promise<OperatorRecord>;
  getSessionProperty(
    googleSub: string,
    sessionId: string,
  ): Promise<SessionPropertyRecord | undefined>;
  setSessionProperty(
    googleSub: string,
    sessionId: string,
    property: ActivePropertyInput,
  ): Promise<SessionPropertyRecord>;
  clearSessionProperty(googleSub: string, sessionId: string): Promise<SessionPropertyRecord>;
  touchLastAccess(googleSub: string): Promise<void>;
}

export function normalizeSessionId(sessionId?: string | null): string {
  const trimmed = sessionId?.trim();
  return trimmed || LEGACY_SESSION_ID;
}
