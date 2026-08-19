import { createGa4McpHandler } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createGa4McpHandler();

export { handler as GET, handler as POST, handler as DELETE, handler as OPTIONS };
