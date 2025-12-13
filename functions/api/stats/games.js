// functions/api/stats/games.js
// Route: GET /api/stats/games?player_id=237&season=2024
//
// Returns raw player game stats rows from BallDontLie via:
// GET https://api.balldontlie.io/v1/stats?player_ids[]=...&seasons[]=...&per_page=100
//
// Note: BDL auth header is Authorization: YOUR_API_KEY (no Bearer). :contentReference[oaicite:6]{index=6}

const BASE_URL = "https://api.balldontlie.io";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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

  const bdlUrl = new URL("/v1/stats", BASE_URL);
  bdlUrl.searchParams.append("player_ids[]", String(playerId));
  bdlUrl.searchParams.append("seasons[]", String(season));
  bdlUrl.searchParams.set("per_page", "100");

  let res;
  try {
    res = await fetch(bdlUrl.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
    });
  } catch {
    return error(502, "BDL_FETCH_FAILED", "Failed to reach BallDontLie.");
  }

  if (!res.ok) {
    return error(502, "BDL_ERROR", `BallDontLie returned status ${res.status}.`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return error(502, "BDL_PARSE_ERROR", "Could not parse BallDontLie JSON.");
  }

  const games = Array.isArray(json.data) ? json.data : [];

  return jsonResponse({
    ok: true,
    player_id: Number(playerId),
    season: Number(season),
    count: games.length,
    data: games,
    meta: json.meta || null,
  });
}
