// functions/api/health.js
// Cloudflare Pages Function for /api/health
// Responds with simple JSON so we know the backend is wired up.

export async function onRequest() {
  const body = JSON.stringify({ status: "ok" });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
