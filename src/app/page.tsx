export const dynamic = "force-dynamic";

export default function HomePage() {
  const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  const mcpUrl = baseUrl ? `${baseUrl}/ga4mcp` : "/ga4mcp";
  const googleCallback = baseUrl
    ? `${baseUrl}/oauth/google/callback`
    : "/oauth/google/callback";

  return (
    <main
      style={{
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        maxWidth: "42rem",
        margin: "3rem auto",
        padding: "0 1.25rem",
        lineHeight: 1.5,
      }}
    >
      <h1>GA4 Analytics MCP V2</h1>
      <p>
        Multi-operator Google Analytics 4 connector for Claude.ai Custom
        Connectors. Each operator signs in with their own Google account.
      </p>
      <ul>
        <li>
          Claude.ai connector URL: <code>{mcpUrl}</code>
        </li>
        <li>
          Google OAuth callback: <code>{googleCallback}</code>
        </li>
      </ul>
      <p>
        <a href="/health">Health</a>
      </p>
      <p style={{ color: "#666" }}>
        Claude authenticates with MCP OAuth. Google sign-in happens during that
        flow and binds the session to the Google account subject. Operators are
        isolated. The Cloud Run service must allow unauthenticated ingress so
        Anthropic can reach <code>/ga4mcp</code>.
      </p>
    </main>
  );
}
