import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { AppError, mapGoogleError } from "@/lib/errors";
import { GOOGLE_OPENID_SCOPES, getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { decryptRefreshToken, encryptRefreshToken } from "@/lib/crypto";
import { getOperatorContext } from "@/lib/request-context";
import { getOperatorStore } from "@/store/operators";

const STATE_TTL_MS = 15 * 60 * 1000;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface SignedOAuthState {
  nonce: string;
  exp: number;
}

export interface GoogleIdentity {
  googleSub: string;
  email: string | null;
  refreshToken: string | null;
}

export function createOAuthClient(): OAuth2Client {
  const config = getConfig();
  return new OAuth2Client({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  });
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function signOAuthState(
  state: SignedOAuthState,
  secret = getConfig().oauthStateSecret,
): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(
  value: string,
  secret = getConfig().oauthStateSecret,
): SignedOAuthState {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    throw new AppError("OAuth state is invalid.", "unauthorized", 401);
  }

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new AppError("OAuth state is invalid.", "unauthorized", 401);
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedOAuthState;
  if (!parsed.nonce || typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
    throw new AppError(
      "OAuth state has expired. Start the Google authorization flow again.",
      "unauthorized",
      401,
    );
  }
  return parsed;
}

export function createSignedOAuthState(): string {
  return signOAuthState({
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  });
}

export function buildGoogleAuthUrl(params: {
  state: string;
  codeChallenge: string;
}): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account",
    scope: [...GOOGLE_OPENID_SCOPES],
    include_granted_scopes: false,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleIdentity> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken({
    code: params.code,
    codeVerifier: params.codeVerifier,
  });

  if (!tokens.id_token) {
    throw new AppError(
      "Google did not return an ID token. OpenID is required to identify the operator.",
      "unauthorized",
      400,
    );
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: getConfig().googleClientId,
  });
  const payload = ticket.getPayload();
  const googleSub = payload?.sub?.trim();
  if (!googleSub) {
    throw new AppError("Google identity is missing a subject identifier.", "unauthorized", 400);
  }

  return {
    googleSub,
    email: payload?.email ?? null,
    refreshToken: tokens.refresh_token ?? null,
  };
}

export async function persistGoogleIdentity(identity: GoogleIdentity) {
  const store = getOperatorStore();
  const existing = await store.getByGoogleSub(identity.googleSub);
  if (!identity.refreshToken && !existing?.encryptedRefreshToken) {
    throw new AppError(
      "Google did not return a refresh token. Revoke this app in Google Account permissions and authorize again.",
      "revoked",
      400,
    );
  }
  return store.upsertCredentials({
    googleSub: identity.googleSub,
    email: identity.email,
    encryptedRefreshToken: identity.refreshToken
      ? encryptRefreshToken(identity.refreshToken)
      : undefined,
  });
}

async function persistRotatedRefreshToken(
  googleSub: string,
  refreshToken: string,
): Promise<void> {
  const store = getOperatorStore();
  const existing = await store.getByGoogleSub(googleSub);
  await store.upsertCredentials({
    googleSub,
    email: existing?.email ?? null,
    encryptedRefreshToken: encryptRefreshToken(refreshToken),
  });
}

export async function getAuthorizedClientForOperator(googleSub: string): Promise<OAuth2Client> {
  const store = getOperatorStore();
  const operator = await store.getByGoogleSub(googleSub);
  if (!operator?.encryptedRefreshToken) {
    throw new AppError(
      "Google account is not connected. Complete the Google authorization flow from Claude.",
      "not_connected",
      401,
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptRefreshToken(operator.encryptedRefreshToken);
  } catch {
    throw new AppError(
      "Stored Google credentials could not be decrypted. Reconnect this Google account from Claude.",
      "not_connected",
      401,
    );
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  try {
    const accessToken = await client.getAccessToken();
    if (!accessToken.token) {
      throw new AppError(
        "Google authorization has expired or been revoked. Reconnect this Google account through the Claude connector.",
        "revoked",
        401,
      );
    }

    const rotated = client.credentials.refresh_token;
    if (rotated && rotated !== refreshToken) {
      await persistRotatedRefreshToken(googleSub, rotated);
      logger.info("Rotated Google refresh token", { googleSub });
    }

    return client;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw mapGoogleError(error);
  }
}

export async function getAuthorizedClient(): Promise<OAuth2Client> {
  const { googleSub } = getOperatorContext();
  return getAuthorizedClientForOperator(googleSub);
}
