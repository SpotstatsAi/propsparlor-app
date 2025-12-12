// /functions/api/stats/averages.js
// Route: GET /api/stats/averages?player_id=237&season=2024
//
// Fetches current-season game logs from BallDontLie
// and computes per-game averages with 1-decimal rounding.
// Also returns last-5 and last-10 game averages.

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

function error(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, { status });
}

// Convert "32:45" → 32.75
function parseMinutes(minStr) {
  if (!minStr || typeof minStr !== "string") return 0;
  const [m, s] = minStr.split(":").map(Number);
  return m + (s || 0) / 60;
}

// Round to 1 decimal but keep numeric
function r1(x) {
  return Number(x.toFixed(1));
}

// Compute averages for a given array of games
function computeAverages(games) {
  const n = games.length;
  if (n === 0) {
    return {
      games: 0,
      averages: null
    };
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

    pts: r1(sumPts / n),
    reb: r1(sumReb / n),
    ast: r1(sumAst / n),
    stl: r1(sumStl / n),
    blk: r1(sumBlk / n),
    tov: r1(sumTov / n),

    pra: r1((sumPts + sumReb + sumAst) / n),
    minutes: r1(sumMinutes / n),

    fg_pct: r1(sumFga === 0 ? 0 : sumFgm / sumFga),
    fg3_pct: r1(sumFg3a === 0 ? 0 : sumFg3m / sumFg3a),
    ft_pct: r1(sumFta === 0 ? 0 : sumFtm / sumFta)
  };

  return {
    games: n,
    averages
  };
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get("player_id");
  const season = url.searchParams.get("season");

  if (!playerId) return error(400, "BAD_REQUEST", "`player_id` is required.");
  if (!season) return error(400, "BAD_REQUEST", "`season` is required.");

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) return error(500, "NO_API_KEY", "BDL_API_KEY is not configured.");

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
  const totalGames = games.length;

  if (totalGames === 0) {
    return jsonResponse({
      ok: true,
      player_id: Number(playerId),
      season: Number(season),
      games: 0,
      averages: null,
      last5: { games: 0, averages: null },
      last10: { games: 0, averages: null },
      message: "No games found for this player and season."
    });
  }

  // Overall season averages
  const overall = computeAverages(games);

  // Last 5 games (or fewer, if <5)
  const count5 = Math.min(5, totalGames);
  const last5Games = games.slice(totalGames - count5);
  const last5 = computeAverages(last5Games);

  // Last 10 games (or fewer, if <10)
  const count10 = Math.min(10, totalGames);
  const last10Games = games.slice(totalGames - count10);
  const last10 = computeAverages(last10Games);

  return jsonResponse({
    ok: true,
    player_id: Number(playerId),
    season: Number(season),
    games: overall.games,
    averages: overall.averages,
    last5,
    last10
  });
}
