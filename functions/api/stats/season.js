// /functions/api/stats/season.js
// GET /api/stats/season?player_id=123&season=2024

function jsonResponse(body, init = {}) {
  const status = init.status || 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(
    {
      ok: false,
      error: { code, message },
    },
    { status }
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const playerIdParam = url.searchParams.get("player_id");
  const seasonParam = url.searchParams.get("season");

  if (!playerIdParam) {
    return errorResponse(400, "BAD_REQUEST", "`player_id` is required.");
  }

  const playerIdNum = Number(playerIdParam);
  if (!Number.isInteger(playerIdNum) || playerIdNum <= 0) {
    return errorResponse(400, "BAD_REQUEST", "`player_id` must be a positive integer.");
  }

  if (!seasonParam) {
    return errorResponse(400, "BAD_REQUEST", "`season` is required.");
  }

  const seasonNum = Number(seasonParam);

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) {
    return errorResponse(500, "CONFIG_ERROR", "BDL_API_KEY missing.");
  }

  // NEW CORRECT ENDPOINT
  const bdlUrl = new URL("https://api.balldontlie.io/v1/season_averages");
  bdlUrl.searchParams.set("season", String(seasonNum));
  bdlUrl.searchParams.append("player_ids[]", String(playerIdNum));

  let upstream;
  try {
    upstream = await fetch(bdlUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    return errorResponse(502, "UPSTREAM_FETCH_FAILED", "Failed to reach BDL.");
  }

  if (!upstream.ok) {
    return errorResponse(
      502,
      "UPSTREAM_ERROR",
      `BDL returned ${upstream.status}`
    );
  }

  let raw;
  try {
    raw = await upstream.json();
  } catch {
    return errorResponse(502, "PARSE_ERROR", "Invalid JSON from BDL.");
  }

  const rows = raw.data || [];

  if (!rows.length) {
    return errorResponse(404, "NOT_FOUND", "No season averages found.");
  }

  return jsonResponse({
    ok: true,
    player_id: playerIdNum,
    season: seasonNum,
    data: rows[0], 
    meta: {
      source: "balldontlie",
      sport: "nba",
      endpoint: "season_averages",
    },
  });
}
