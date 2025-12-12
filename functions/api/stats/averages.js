// /functions/api/stats/averages.js
// Route: GET /api/stats/averages?player_id=237&season=2024
//
// Computes season averages from raw game logs.

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

function error(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, { status });
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = url.origin;

  const playerId = url.searchParams.get("player_id");
  const season = url.searchParams.get("season");

  if (!playerId) return error(400, "BAD_REQUEST", "`player_id` is required.");
  if (!season) return error(400, "BAD_REQUEST", "`season` is required.");

  // Call the internal games endpoint
  const gamesUrl = `${origin}/api/stats/games?player_id=${playerId}&season=${season}`;
  const res = await fetch(gamesUrl);

  if (!res.ok) return error(502, "GAMES_ENDPOINT_ERROR", "Failed to fetch game logs.");

  const body = await res.json();
  const games = body.data || [];

  if (!games.length) return error(404, "NO_DATA", "No games available.");

  // Accumulators
  let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, tov = 0;
  let fgm = 0, fga = 0, fg3m = 0, fg3a = 0, ftm = 0, fta = 0;
  let minutes = 0;

  for (const g of games) {
    pts += g.pts;
    reb += g.reb;
    ast += g.ast;
    stl += g.stl;
    blk += g.blk;
    tov += g.turnover;

    fgm += g.fgm;
    fga += g.fga;
    fg3m += g.fg3m;
    fg3a += g.fg3a;
    ftm += g.ftm;
    fta += g.fta;

    minutes += g.min;
  }

  const n = games.length;

  const averages = {
    games_played: n,
    pts: pts / n,
    reb: reb / n,
    ast: ast / n,
    stl: stl / n,
    blk: blk / n,
    tov: tov / n,
    pra: (pts + reb + ast) / n,
    minutes: minutes / n,

    fg_pct: fga === 0 ? 0 : fgm / fga,
    fg3_pct: fg3a === 0 ? 0 : fg3m / fg3a,
    ft_pct: fta === 0 ? 0 : ftm / fta,

    fgm, fga,
    fg3m, fg3a,
    ftm, fta,
  };

  return jsonResponse({
    ok: true,
    player_id: Number(playerId),
    season: Number(season),
    games: n,
    averages,
  });
}
