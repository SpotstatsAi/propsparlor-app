// /functions/api/health.js
// Route: GET /api/health
// Simple test endpoint

export async function onRequest() {
  return new Response(
    JSON.stringify({
      ok: true,
      status: "ok",
      service: "propsparlor-api",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
