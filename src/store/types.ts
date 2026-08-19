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
  encryptedRefreshToken: string;
}

export interface ActivePropertyInput {
  propertyId: string;
  propertyName: string;
  account: string;
}

export interface OperatorStore {
  getByGoogleSub(googleSub: string): Promise<OperatorRecord | undefined>;
  upsertCredentials(input: UpsertOperatorCredentialsInput): Promise<OperatorRecord>;
  setActiveProperty(googleSub: string, property: ActivePropertyInput): Promise<OperatorRecord>;
  clearActiveProperty(googleSub: string): Promise<OperatorRecord>;
  touchLastAccess(googleSub: string): Promise<void>;
}
