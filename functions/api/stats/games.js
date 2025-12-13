// /functions/api/stats/games.js
// Route: GET /api/stats/games?player_id=237&season=2024
//
// Returns raw current-season game logs from BallDontLie.

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" }
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
  if (!apiKey) {
    return error(500, "NO_API_KEY", "BDL_API_KEY is not configured.");
  }

  // Simple: one call, 100 games max (more than enough for a season)
  const bdlUrl =
    `https://api.balldontlie.io/v1/stats` +
    `?player_ids[]=${encodeURIComponent(playerId)}` +
    `&seasons[]=${encodeURIComponent(season)}` +
    `&per_page=100`;

  let res;
  try {
    res = await fetch(bdlUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    });
  } catch (e) {
    return error(502, "BDL_FETCH_FAILED", "Failed to reach BallDontLie.");
  }

  if (!res.ok) {
    return error(502, "BDL_ERROR", `BallDontLie returned status ${res.status}.`);
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    return error(502, "BDL_PARSE_ERROR", "Could not parse BallDontLie JSON.");
  }

  const games = Array.isArray(json.data) ? json.data : [];

  return jsonResponse({
    ok: true,
    player_id: Number(playerId),
    season: Number(season),
    count: games.length,
    data: games
  });
}
