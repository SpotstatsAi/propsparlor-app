// /functions/api/stats/games.js
// Route: GET /api/stats/games?player_id=237&season=2024
//
// Pulls ALL game logs for the current season.
// This is the only way to get real-time season stats from BDL.

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function error(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, { status });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get("player_id");
  const season = url.searchParams.get("season");

  if (!playerId) return error(400, "BAD_REQUEST", "`player_id` is required.");
  if (!season) return error(400, "BAD_REQUEST", "`season` is required.");

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) return error(500, "NO_API_KEY", "BDL_API_KEY missing.");

  const base = "https://api.balldontlie.io/v1/stats";

  let page = 1;
  let perPage = 100;
  let allGames = [];

  while (true) {
    const bdlUrl = `${base}?player_ids[]=${playerId}&seasons[]=${season}&per_page=${perPage}&page=${page}`;

    const res = await fetch(bdlUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) return error(502, "BDL_ERROR", `BDL returned ${res.status}`);

    const data = await res.json();

    allGames = allGames.concat(data.data);

    if (!data.meta || data.meta.next_page === null) break;

    page++;
  }

  return jsonResponse({
    ok: true,
    count: allGames.length,
    player_id: Number(playerId),
    season: Number(season),
    data: allGames,
  });
}
