// functions/api/stats/averages.js
// Route: GET /api/stats/averages?player_id=237&window=10&season=2024
//
// Pulls player game logs from BallDontLie /v1/stats and computes per-game averages.
// - window is required by the UI (5 or 10). Defaults to 10.
// - season is optional. If omitted, the API may return across seasons; pass season if you want strict season windows.
// - Authorization header is "Authorization: YOUR_API_KEY" (NO Bearer).

const BASE_URL = "https://api.balldontlie.io";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function badRequest(message) {
  return json({ ok: false, error: { code: "BAD_REQUEST", message } }, 400);
}

function upstream(status, message, details) {
  return json(
    {
      ok: false,
      error: { code: "UPSTREAM_ERROR", message, status, details: details || null },
    },
    502
  );
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// Convert "MM:SS" to seconds
function parseMinToSeconds(minStr) {
  if (!minStr || typeof minStr !== "string") return 0;
  const parts = minStr.split(":");
  if (parts.length !== 2) return 0;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return 0;
  return m * 60 + s;
}

function secondsToMinutes1Decimal(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0.0;
  return round1(seconds / 60);
}

function computeAverages(rows) {
  const n = rows.length;
  if (!n) return { games: 0, averages: null };

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

  let sumSeconds = 0;

  for (const r of rows) {
    sumPts += num(r?.pts);
    sumReb += num(r?.reb);
    sumAst += num(r?.ast);
    sumStl += num(r?.stl);
    sumBlk += num(r?.blk);
    sumTov += num(r?.turnover ?? r?.turnovers);

    sumFgm += num(r?.fgm);
    sumFga += num(r?.fga);
    sumFg3m += num(r?.fg3m);
    sumFg3a += num(r?.fg3a);
    sumFtm += num(r?.ftm);
    sumFta += num(r?.fta);

    sumSeconds += parseMinToSeconds(r?.min);
  }

  const averages = {
    games_played: n,

    pts: round1(sumPts / n),
    reb: round1(sumReb / n),
    ast: round1(sumAst / n),
    stl: round1(sumStl / n),
    blk: round1(sumBlk / n),
    tov: round1(sumTov / n),

    pra: round1((sumPts + sumReb + sumAst) / n),
    minutes: secondsToMinutes1Decimal(sumSeconds / n),

    // Keep these as 0..1 ratios (frontend can display as pct later if desired)
    fg_pct: round1(sumFga > 0 ? sumFgm / sumFga : 0),
    fg3_pct: round1(sumFg3a > 0 ? sumFg3m / sumFg3a : 0),
    ft_pct: round1(sumFta > 0 ? sumFtm / sumFta : 0),

    // include 3PM for your UI keys
    fg3m: round1(sumFg3m / n),
  };

  return { games: n, averages };
}

async function fetchLatestStats({ apiKey, playerId, season, limit }) {
  // Pull pages until we have at least `limit` rows (or run out)
  const out = [];
  let cursor = null;
  let safety = 0;

  while (out.length < limit) {
    safety += 1;
    if (safety > 15) break;

    const url = new URL("/v1/stats", BASE_URL);
    url.searchParams.set("per_page", "100");
    url.searchParams.append("player_ids[]", String(playerId));
    if (Number.isFinite(season)) url.searchParams.append("seasons[]", String(season));
    if (cursor) url.searchParams.set("cursor", String(cursor));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: apiKey, // NO "Bearer"
      },
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload) {
      const detail = payload || (await res.text().catch(() => null));
      throw { status: res.status, detail };
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];
    out.push(...rows);

    const next = payload?.meta?.next_cursor ?? null;
    if (!next) break;
    cursor = next;
  }

  // Sort by game.date ASC for window slicing stability
  out.sort((a, b) => {
    const ad = a?.game?.date ? Date.parse(a.game.date) : 0;
    const bd = b?.game?.date ? Date.parse(b.game.date) : 0;
    return ad - bd;
  });

  return out;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playerIdRaw = url.searchParams.get("player_id");
  const windowRaw = url.searchParams.get("window");
  const seasonRaw = url.searchParams.get("season");

  const playerId = playerIdRaw ? parseInt(playerIdRaw, 10) : NaN;
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return badRequest("`player_id` is required and must be a positive integer.");
  }

  const windowN = windowRaw ? parseInt(windowRaw, 10) : 10;
  const safeWindow = Number.isFinite(windowN) ? Math.min(Math.max(windowN, 1), 25) : 10;

  const season = seasonRaw ? parseInt(seasonRaw, 10) : NaN;
  const seasonNum = Number.isFinite(season) ? season : null;

  const apiKey = env?.BDL_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: { code: "NO_API_KEY", message: "BDL_API_KEY is not configured." } }, 500);
  }

  try {
    const all = await fetchLatestStats({
      apiKey,
      playerId,
      season: seasonNum,
      limit: Math.max(100, safeWindow), // fetch at least one page; may include multiple pages
    });

    if (!all.length) {
      return json({
        ok: true,
        player_id: playerId,
        season: seasonNum,
        window: safeWindow,
        games: 0,
        averages: null,
        message: "No stats found for this player (and season, if provided).",
      });
    }

    const slice = all.slice(-safeWindow);
    const result = computeAverages(slice);

    return json({
      ok: true,
      player_id: playerId,
      season: seasonNum,
      window: safeWindow,
      games: result.games,
      averages: result.averages,
    });
  } catch (e) {
    return upstream(
      e?.status || 502,
      "Failed to fetch stats from BallDontLie.",
      e?.detail || null
    );
  }
}
