import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { encryptRefreshToken } from "@/lib/crypto";
import { runWithOperator } from "@/lib/request-context";
import { createMemoryOperatorStore } from "@/store/memory";
import { setOperatorStore } from "@/store/operators";
import { setRequiredEnv } from "@/test/env";

const getToken = vi.fn();
const getAccessToken = vi.fn();
const verifyIdToken = vi.fn();
const generateAuthUrl = vi.fn(
  (opts: { state: string; code_challenge: string }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}&code_challenge=${opts.code_challenge}`,
);
const setCredentials = vi.fn();
const credentials: { refresh_token?: string } = {};

vi.mock("google-auth-library", () => ({
  CodeChallengeMethod: { S256: "S256" },
  OAuth2Client: class {
    generateAuthUrl = generateAuthUrl;
    getToken = getToken;
    getAccessToken = getAccessToken;
    verifyIdToken = verifyIdToken;
    setCredentials = (value: { refresh_token?: string }) => {
      setCredentials(value);
      credentials.refresh_token = value.refresh_token;
    };
    credentials = credentials;
  },
}));

describe("Google OAuth helpers", () => {
  beforeEach(() => {
    setRequiredEnv();
    setOperatorStore(createMemoryOperatorStore());
    vi.clearAllMocks();
    credentials.refresh_token = undefined;
  });

  it("builds a Google authorization URL with PKCE, OpenID, and GA4 readonly", async () => {
    const { buildGoogleAuthUrl, createPkcePair, createSignedOAuthState } = await import(
      "@/google/auth"
    );
    const { challenge } = createPkcePair();
    const state = createSignedOAuthState();
    const url = buildGoogleAuthUrl({ state, codeChallenge: challenge });

    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "select_account",
        scope: [
          "openid",
          "email",
          "https://www.googleapis.com/auth/analytics.readonly",
        ],
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    );
    expect(url).toContain("accounts.google.com");
  });

  it("keeps an existing refresh token when Google omits a new one", async () => {
    getToken.mockResolvedValue({
      tokens: { id_token: "id-token" },
    });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-a", email: "operator-a@example.com" }),
    });
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "google-sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//existing"),
    });
    setOperatorStore(store);
    const { exchangeAuthorizationCode, persistGoogleIdentity } = await import("@/google/auth");
    const { decryptRefreshToken } = await import("@/lib/crypto");
    const identity = await exchangeAuthorizationCode({
      code: "auth-code",
      codeVerifier: "verifier",
    });
    expect(identity.refreshToken).toBeNull();
    await persistGoogleIdentity(identity);
    const updated = await store.getByGoogleSub("google-sub-a");
    expect(decryptRefreshToken(updated?.encryptedRefreshToken ?? "")).toBe("1//existing");
  });

  it("rejects a first-time Google login that returns no refresh token", async () => {
    getToken.mockResolvedValue({
      tokens: { id_token: "id-token" },
    });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-new", email: "new@example.com" }),
    });
    const { exchangeAuthorizationCode, persistGoogleIdentity } = await import("@/google/auth");
    const identity = await exchangeAuthorizationCode({
      code: "auth-code",
      codeVerifier: "verifier",
    });
    await expect(persistGoogleIdentity(identity)).rejects.toMatchObject({ code: "revoked" });
  });

  it("verifies signed OAuth state and rejects tampering", async () => {
    const { createSignedOAuthState, verifyOAuthState } = await import("@/google/auth");
    const state = createSignedOAuthState();
    expect(verifyOAuthState(state).nonce).toBeTruthy();
    expect(() => verifyOAuthState(`${state}tampered`)).toThrow(AppError);
  });

  it("exchanges an authorization code for identity and a refresh token", async () => {
    getToken.mockResolvedValue({
      tokens: { refresh_token: "1//refresh", id_token: "id-token" },
    });
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "google-sub-a", email: "operator-a@example.com" }),
    });
    const { exchangeAuthorizationCode } = await import("@/google/auth");
    await expect(
      exchangeAuthorizationCode({ code: "auth-code", codeVerifier: "verifier" }),
    ).resolves.toEqual({
      googleSub: "google-sub-a",
      email: "operator-a@example.com",
      refreshToken: "1//refresh",
    });
  });

  it("loads the operator-scoped refresh token and fails closed without context", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//token-a"),
    });
    setOperatorStore(store);
    getAccessToken.mockResolvedValue({ token: "ya29.access" });
    const { getAuthorizedClient } = await import("@/google/auth");
    await expect(getAuthorizedClient()).rejects.toMatchObject({ code: "unauthorized" });
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
      async () => {
        await getAuthorizedClient();
      },
    );
    expect(setCredentials).toHaveBeenCalledWith({ refresh_token: "1//token-a" });
  });

  it("maps a revoked refresh token", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//token-a"),
    });
    setOperatorStore(store);
    getAccessToken.mockRejectedValue(
      new Error("invalid_grant: Token has been expired or revoked."),
    );
    const { getAuthorizedClient } = await import("@/google/auth");
    await expect(
      runWithOperator(
        { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
        () => getAuthorizedClient(),
      ),
    ).rejects.toMatchObject({ code: "revoked" });
  });

  it("stores a rotated refresh token", async () => {
    const store = createMemoryOperatorStore();
    await store.upsertCredentials({
      googleSub: "sub-a",
      encryptedRefreshToken: encryptRefreshToken("1//old-token"),
    });
    setOperatorStore(store);
    getAccessToken.mockImplementation(async () => {
      credentials.refresh_token = "1//new-token";
      return { token: "ya29.access" };
    });
    const { getAuthorizedClient, decryptRefreshToken } = await import("@/google/auth").then(
      async (mod) => ({
        getAuthorizedClient: mod.getAuthorizedClient,
        decryptRefreshToken: (await import("@/lib/crypto")).decryptRefreshToken,
      }),
    );
    await runWithOperator(
      { requestId: "r1", operatorId: "op-a", googleSub: "sub-a" },
      () => getAuthorizedClient(),
    );
    const updated = await store.getByGoogleSub("sub-a");
    expect(decryptRefreshToken(updated?.encryptedRefreshToken ?? "")).toBe("1//new-token");
  });
});
