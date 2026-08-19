export const GA4_READONLY_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

export const GOOGLE_OPENID_SCOPES = ["openid", "email", GA4_READONLY_SCOPE] as const;

export interface AppConfig {
  appBaseUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  mcpTokenSecret: string;
  oauthStateSecret: string;
  tokenEncryptionKey: string;
  firestoreProjectId: string | undefined;
  mcpOAuthClientId: string | undefined;
  mcpOAuthClientSecret: string | undefined;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getConfig(): AppConfig {
  const appBaseUrl = stripTrailingSlash(required("APP_BASE_URL"));
  const googleRedirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() || `${appBaseUrl}/oauth/google/callback`;

  return {
    appBaseUrl,
    googleClientId: required("GOOGLE_CLIENT_ID"),
    googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri,
    mcpTokenSecret: required("MCP_TOKEN_SECRET"),
    oauthStateSecret: required("OAUTH_STATE_SECRET"),
    tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"),
    firestoreProjectId: process.env.FIRESTORE_PROJECT_ID?.trim() || undefined,
    mcpOAuthClientId: process.env.MCP_OAUTH_CLIENT_ID?.trim() || undefined,
    mcpOAuthClientSecret: process.env.MCP_OAUTH_CLIENT_SECRET?.trim() || undefined,
  };
}
