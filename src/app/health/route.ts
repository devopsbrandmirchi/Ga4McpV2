export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    version: "2.0.0",
  });
}
