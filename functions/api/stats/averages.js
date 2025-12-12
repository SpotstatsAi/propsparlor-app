// /functions/api/stats/averages.js
// Route: GET /api/stats/averages?player_id=237&season=2024
//
// Fetches current-season game logs from BallDontLie
// and computes per-game averages.

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function error(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, { status });
}

// Convert BDL "min" field like "32:45" to decimal minutes (32.75)
function parseMinutes(minStr) {
  if (!minStr || typeof minStr !== "string") return 0;
  const parts = minStr.split(":");
  const m = Number(parts[0] || 0);
  const s = Number(parts[1] || 0);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return 0;
  return m + s / 60;
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
  const n = games.length;

  if (n === 0) {
    // No games yet this season; not an error, just no data.
    return jsonResponse({
      ok: true,
      player_id: Number(playerId),
      season: Number(season),
      games: 0,
      averages: null,
      message: "No games found for this player and season."
    });
  }

  let sumPts = 0,
    sumReb = 0,
    sumAst = 0,
    sumStl = 0,
    sumBlk = 0,
    sumTov = 0;
  let sumFgm = 0,
    sumFga = 0,
    sumFg3m = 0,
    sumFg3a = 0,
    sumFtm = 0,
    sumFta = 0;
  let sumMinutes = 0;

  for (const g of games) {
    sumPts += g.pts || 0;
    sumReb += g.reb || 0;
    sumAst += g.ast || 0;
    sumStl += g.stl || 0;
    sumBlk += g.blk || 0;
    sumTov += g.turnover || 0;

    sumFgm += g.fgm || 0;
    sumFga += g.fga || 0;
    sumFg3m += g.fg3m || 0;
    sumFg3a += g.fg3a || 0;
    sumFtm += g.ftm || 0;
    sumFta += g.fta || 0;

    sumMinutes += parseMinutes(g.min);
  }

  const averages = {
    games_played: n,
    pts: sumPts / n,
    reb: sumReb / n,
    ast: sumAst / n,
    stl: sumStl / n,
    blk: sumBlk / n,
    tov: sumTov / n,
    pra: (sumPts + sumReb + sumAst) / n,
    minutes: sumMinutes / n,

    fg_pct: sumFga === 0 ? 0 : sumFgm / sumFga,
    fg3_pct: sumFg3a === 0 ? 0 : sumFg3m / sumFg3a,
    ft_pct: sumFta === 0 ? 0 : sumFtm / sumFta
  };

  return jsonResponse({
    ok: true,
    player_id: Number(playerId),
    season: Number(season),
    games: n,
    averages
  });
}
