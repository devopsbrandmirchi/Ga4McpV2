# GA4 Analytics MCP V2

Multi-operator Google Analytics 4 connector for **Claude.ai Custom Connectors**, hosted on **Google Cloud Run**.

This is Version 2. It is a separate application from V1. Do not reuse V1 secrets, OAuth clients, Cloud Run services, or Git remotes.

```text
Operator A or Operator B
  → same Claude Custom Connector URL
  → https://<v2-host>/ga4mcp
  → MCP OAuth (Claude → V2)
  → Google OAuth (operator's own Google account)
  → operator credentials + active GA4 property in Firestore
  → GA4 Admin / Data APIs
```

There is no local stdio server and no Supabase.

## Architecture

Two OAuth layers are linked:

1. **Claude → V2:** MCP OAuth 2.1 (protected resource metadata, DCR, CIMD, PKCE).
2. **V2 → Google:** Google sign-in happens *inside* MCP authorize. The MCP access token `sub` is the Google account subject (`sub`). Email is display-only.

Each operator has:

- their own encrypted Google refresh token
- their own accessible GA4 property list (from Google Admin API)
- their own persisted active property

Operator A cannot use Operator B's Google credential or select a property that Google account A cannot access.

## MCP tools

| Tool | Purpose |
| --- | --- |
| `ga4_get_operator` | Authenticated operator (email + internal operatorId). No tokens. |
| `ga4_list_properties` | Properties visible to that Google account, with `isActive` |
| `ga4_get_active_property` | Currently selected property |
| `ga4_set_active_property` | Switch after a live allow-list check |
| `ga4_get_metadata` | Dimensions/metrics for the active or newly authorized property |
| `ga4_run_report` | Historical GA4 report |
| `ga4_run_realtime_report` | Last ~30 minutes |

Report tools use the stored active property when `propertyId` is omitted. A supplied `propertyId` is accepted only if the authenticated Google account can access it, and then becomes the new active property.

## Local development

```powershell
cd D:\MCP_Servers\Ga4McpV2
npm install
copy .env.example .env.local
```

Fill in `.env.local` with **V2** values. Do not copy V1 secrets.

Optional Firestore emulator:

```powershell
gcloud emulators firestore start --host-port=localhost:8080
```

Set `FIRESTORE_EMULATOR_HOST=localhost:8080` and `FIRESTORE_PROJECT_ID` in `.env.local`.

```powershell
npm run dev
npm test
npm run build
```

- App: `http://localhost:3000`
- MCP: `http://localhost:3000/ga4mcp`
- Health: `http://localhost:3000/health`
- Google callback: `http://localhost:3000/oauth/google/callback`

Claude.ai cannot reach `localhost`. Deploy V2 to Cloud Run before adding the Custom Connector.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_BASE_URL` | Yes | Public origin, no trailing slash |
| `GOOGLE_CLIENT_ID` | Yes | V2 Google OAuth web client |
| `GOOGLE_CLIENT_SECRET` | Yes | V2 Google OAuth secret |
| `GOOGLE_REDIRECT_URI` | No | Defaults to `${APP_BASE_URL}/oauth/google/callback` |
| `MCP_TOKEN_SECRET` | Yes | Signs MCP JWTs |
| `OAUTH_STATE_SECRET` | Yes | Signs Google state and encrypts pending-authorize cookies |
| `TOKEN_ENCRYPTION_KEY` | Yes | Encrypts Google refresh tokens at rest |
| `FIRESTORE_PROJECT_ID` | Production | Firestore project |
| `FIRESTORE_EMULATOR_HOST` | Local/test | Firestore emulator host |
| `MCP_OAUTH_CLIENT_ID` | No | Optional pre-registered Claude confidential client |
| `MCP_OAUTH_CLIENT_SECRET` | No | Pair for the optional confidential client |

V2 does **not** use `GOOGLE_REFRESH_TOKEN` or `MCP_AUTH_TOKEN`.

## Google Cloud configuration

Use a **new** Google Cloud project when possible. If you share a project with V1, still create a distinct Cloud Run service, Artifact Registry repo, OAuth client, and secrets.

Enable:

- Cloud Run
- Cloud Build
- Artifact Registry
- Firestore
- Secret Manager
- Google Analytics Admin API
- Google Analytics Data API

Suggested resource names (placeholders — replace with your project):

- Cloud Run service: `ga4-mcp-v2`
- Artifact Registry: `ga4-mcp-v2`
- Firestore collection: `operators`

Cloud Run service account should have:

- `roles/datastore.user` on the V2 Firestore database
- `roles/secretmanager.secretAccessor` on V2 secrets only

Do not grant the service account Secret Manager admin or access to V1 secrets.

## Google OAuth client (V2 only)

Create a **new** OAuth Web application. Do not edit the V1 client.

Consent screen:

- User type: External (or Internal for Workspace-only)
- App name: something like `GA4 MCP Connector V2`
- Scopes:
  - `openid`
  - `email`
  - `https://www.googleapis.com/auth/analytics.readonly`
- Add test users while the app is in Testing
- Publishing is required for non-test users because Analytics scopes are sensitive

Authorized redirect URI:

```text
https://<v2-cloud-run-url>/oauth/google/callback
```

Locally:

```text
http://localhost:3000/oauth/google/callback
```

## Claude Custom Connector

1. Deploy V2 and set `APP_BASE_URL` to the Cloud Run URL.
2. In Claude, add a Custom Connector.
3. URL: `https://<v2-host>/ga4mcp`
4. Each operator completes Google sign-in from their own Claude account.
5. If the Google account has multiple GA4 properties, they pick one. That choice persists until they switch.

## Testing

```powershell
npm test
```

Unit tests cover:

- MCP OAuth metadata, DCR, PKCE, and Google-bound JWT `sub`
- Operator isolation (credentials and property allow-lists)
- Persistent active property
- Token refresh / rotation
- Revoked Google grants
- Structured log redaction

No live V1 credentials are used.

## Deployment (do not run until requested)

Documented only. V1 deployment must stay untouched.

```powershell
.\scripts\cloud-run-setup.ps1 -ProjectId YOUR_V2_PROJECT_ID
.\scripts\cloud-run-deploy.ps1 -ProjectId YOUR_V2_PROJECT_ID
.\scripts\cloud-run-set-env.ps1 `
  -ProjectId YOUR_V2_PROJECT_ID `
  -AppBaseUrl https://YOUR_V2_CLOUD_RUN_URL `
  -GoogleClientId YOUR_V2_CLIENT_ID `
  -GoogleClientSecret YOUR_V2_CLIENT_SECRET `
  -McpTokenSecret YOUR_MCP_TOKEN_SECRET `
  -OauthStateSecret YOUR_OAUTH_STATE_SECRET `
  -TokenEncryptionKey YOUR_TOKEN_ENCRYPTION_KEY
```

Prefer Secret Manager references for production secrets instead of plaintext env values when you wire the service.

After deploy:

1. Add the Cloud Run callback URI to the V2 OAuth client.
2. Confirm Firestore is created in Native mode.
3. Add `https://<v2-host>/ga4mcp` in Claude.

## Security considerations

- Refresh tokens are encrypted with AES-256-GCM before Firestore writes.
- MCP tools never return access tokens, refresh tokens, or authorization codes.
- Logs redact tokens, secrets, cookies, and authorization codes.
- Property IDs from Claude are checked against the live Admin API list for that operator.
- Tools fail closed if no operator context is bound to the request.
- HTTPS-only cookies in production.

## Git

This repository is V2 only. The V1 remote is `git@github.com:devopsbrandmirchi/Ga4McpServer.git` and must never be added here. Create a new GitHub repository when you are ready to publish V2.
