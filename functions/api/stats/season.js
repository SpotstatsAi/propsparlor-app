// /functions/api/stats/season.js
// Route: GET /api/stats/season?player_id=123&season=2024
//
// Uses BALLDONTLIE NBA player season stats endpoint:
//   GET https://api.balldontlie.io/nba/v1/player_season_stats?season=2024&player_ids[]=123
//
// Standard response format:
//   {
//     ok: true | false,
//     data: { ...cleanSeasonStats },
//     meta: { source, sport, endpoint },
//     error?: { code, message }
//   }

function jsonResponse(body, init = {}) {
  const status = init.status || 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(
    {
      ok: false,
      error: { code, message }
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
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Query parameter 'player_id' is required."
    );
  }

  const playerIdNum = Number(playerIdParam);
  if (!Number.isInteger(playerIdNum) || playerIdNum <= 0) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Query parameter 'player_id' must be a positive integer."
    );
  }

  if (!seasonParam) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Query parameter 'season' is required (e.g., 2024)."
    );
  }

  const seasonNum = Number(seasonParam);
  if (!Number.isInteger(seasonNum) || seasonNum < 1979) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Query parameter 'season' must be a valid year (e.g., 2024)."
    );
  }

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) {
    return errorResponse(
      500,
      "CONFIG_ERROR",
      "BDL_API_KEY is not configured in the environment."
    );
  }

  const bdlUrl = new URL(
    "https://api.balldontlie.io/nba/v1/player_season_stats"
  );
  bdlUrl.searchParams.set("season", String(seasonNum));
  bdlUrl.searchParams.append("player_ids[]", String(playerIdNum));

  let upstream;
  try {
    upstream = await fetch(bdlUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    });
  } catch (err) {
    return errorResponse(
      502,
      "UPSTREAM_FETCH_FAILED",
      "Failed to reach BALLDONTLIE player season stats endpoint."
    );
  }

  if (!upstream.ok) {
    return errorResponse(
      502,
      "UPSTREAM_ERROR",
      `BALLDONTLIE player season stats endpoint returned status ${upstream.status}.`
    );
  }

  let raw;
  try {
    raw = await upstream.json();
  } catch (err) {
    return errorResponse(
      502,
      "UPSTREAM_PARSE_FAILED",
      "Unable to parse BALLDONTLIE player season stats response as JSON."
    );
  }

  const rows = Array.isArray(raw.data) ? raw.data : [];
  if (rows.length === 0) {
    return errorResponse(
      404,
      "NOT_FOUND",
      "No season stats found for the given player and season."
    );
  }

  const s = rows[0];

  const clean = {
    season: s.season ?? seasonNum,
    player_id: s.player_id ?? playerIdNum,
    team_id: s.team_id ?? null,

    games_played: s.games_played ?? null,
    games_started: s.games_started ?? null,

    min: s.min ?? null,

    fgm: s.fgm ?? null,
    fga: s.fga ?? null,
    fg_pct: s.fg_pct ?? null,

    fg3m: s.fg3m ?? null,
    fg3a: s.fg3a ?? null,
    fg3_pct: s.fg3_pct ?? null,

    ftm: s.ftm ?? null,
    fta: s.fta ?? null,
    ft_pct: s.ft_pct ?? null,

    oreb: s.oreb ?? null,
    dreb: s.dreb ?? null,
    reb: s.reb ?? null,

    ast: s.ast ?? null,
    stl: s.stl ?? null,
    blk: s.blk ?? null,
    turnover: s.turnover ?? null,
    pf: s.pf ?? null,
    pts: s.pts ?? null
  };

  return jsonResponse({
    ok: true,
    player_id: playerIdNum,
    season: seasonNum,
    data: clean,
    meta: {
      source: "balldontlie",
      sport: "nba",
      endpoint: "stats.season"
    }
  });
}
