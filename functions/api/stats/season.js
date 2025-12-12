// functions/api/stats/season.js

const BASE_URL = "https://api.balldontlie.io";

/**
 * GET /api/stats/season?player_id=237&season=2024
 *
 * - Pulls all game logs for the player/season from BDL /v1/stats
 * - Computes season averages
 * - Computes last 5 & last 10 game averages
 * - Caches results in KV for ~12 hours
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playerIdParam = url.searchParams.get("player_id");
  const seasonParam = url.searchParams.get("season"); // optional, can be null

  const playerId = playerIdParam ? parseInt(playerIdParam, 10) : null;
  const season = seasonParam ? parseInt(seasonParam, 10) : null;

  if (!playerId || Number.isNaN(playerId)) {
    return jsonResponse(
      {
        ok: false,
        error: {
          source: "worker",
          message: "Missing or invalid player_id query parameter.",
        },
      },
      400
    );
  }

  // Build cache key (season can be null → use "all")
  const seasonKey = season ? String(season) : "all";
  const cacheKey = `stats-season:${playerId}:${seasonKey}`;

  // 1) Try KV cache first
  try {
    const cached = await env.PROPSPARLOR_BDL_CACHE.get(cacheKey);
    if (cached) {
      return jsonResponseRaw(cached, 200);
    }
  } catch (err) {
    console.error("KV get error (stats-season):", err);
    // fall through to BDL
  }

  // 2) Cache miss → fetch all stats pages from BDL
  try {
    const allStats = await fetchAllStatsFromBDL(env.BDL_API_KEY, playerId, season);

    // Sort by game date ascending so last5/last10 are easy to slice
    allStats.sort((a, b) => {
      const da = a.game && a.game.date ? new Date(a.game.date).getTime() : 0;
      const db = b.game && b.game.date ? new Date(b.game.date).getTime() : 0;
      return da - db;
    });

    const last5 = allStats.slice(-5);
    const last10 = allStats.slice(-10);

    const seasonAvgs = computeAverages(allStats);
    const last5Avgs = computeAverages(last5);
    const last10Avgs = computeAverages(last10);

    const payloadObj = {
      ok: true,
      player_id: playerId,
      season: season || null,
      games_count: allStats.length,
      season_averages: seasonAvgs,
      last5_averages: last5Avgs,
      last10_averages: last10Avgs,
      game_logs: allStats, // full raw logs so frontend can still drill down
    };

    const payload = JSON.stringify(payloadObj, null, 2);

    // 3) Store in KV with ~12 hour TTL (daily/overnight refresh)
    try {
      await env.PROPSPARLOR_BDL_CACHE.put(cacheKey, payload, {
        expirationTtl: 60 * 60 * 12, // 12 hours
      });
    } catch (err) {
      console.error("KV put error (stats-season):", err);
      // still return fresh data
    }

    return jsonResponseRaw(payload, 200);
  } catch (err) {
    console.error("Unexpected error in stats-season:", err);

    return jsonResponse(
      {
        ok: false,
        error: {
          source: "worker",
          message: "Unexpected error in stats-season.",
        },
      },
      500
    );
  }
}

/**
 * Fetch all stats pages from BDL for a given player (and optional season)
 * using the /v1/stats endpoint with cursor-based pagination.
 */
async function fetchAllStatsFromBDL(apiKey, playerId, season) {
  const allStats = [];
  let cursor = null;
  let safetyCounter = 0;

  while (true) {
    safetyCounter += 1;
    if (safetyCounter > 30) {
      console.warn("stats-season: pagination safety break");
      break;
    }

    const url = new URL("/v1/stats", BASE_URL);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("player_ids[]", String(playerId));
    if (season) {
      url.searchParams.set("seasons[]", String(season));
    }
    if (cursor) {
      url.searchParams.set("cursor", String(cursor));
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: apiKey, // BDL: Authorization: YOUR_API_KEY
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("BDL stats-season error:", response.status, errorText);

      throw new Error(
        `Failed to fetch stats from BallDontLie. Status ${response.status}`
      );
    }

    const json = await response.json();
    const pageData = json.data || [];

    allStats.push(...pageData);

    const meta = json.meta || {};
    if (!meta.next_cursor) break;

    cursor = meta.next_cursor;
  }

  return allStats;
}

/**
 * Compute per-game averages (season, last5, last10).
 * All averages are rounded to 1 decimal place.
 */
function computeAverages(stats) {
  const count = stats.length;
  if (!count) {
    return {
      games: 0,
      pts: 0.0,
      reb: 0.0,
      ast: 0.0,
      stl: 0.0,
      blk: 0.0,
      turnover: 0.0,
      fga: 0.0,
      fgm: 0.0,
      fg3a: 0.0,
      fg3m: 0.0,
      fta: 0.0,
      ftm: 0.0,
      fg_pct: null,
      fg3_pct: null,
      ft_pct: null,
      minutes: "0.0",
    };
  }

  let totalPts = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalTov = 0;
  let totalFga = 0;
  let totalFgm = 0;
  let totalFg3a = 0;
  let totalFg3m = 0;
  let totalFta = 0;
  let totalFtm = 0;
  let totalSeconds = 0;

  for (const row of stats) {
    const s = row || {};

    totalPts += safeNumber(s.pts);
    totalReb += safeNumber(s.reb);
    totalAst += safeNumber(s.ast);
    totalStl += safeNumber(s.stl);
    totalBlk += safeNumber(s.blk);
    totalTov += safeNumber(s.turnover || s.turnovers);

    totalFga += safeNumber(s.fga);
    totalFgm += safeNumber(s.fgm);
    totalFg3a += safeNumber(s.fg3a || s.fg3a_ || s.fg3a_total);
    totalFg3m += safeNumber(s.fg3m || s.fg3m_ || s.fg3m_total);
    totalFta += safeNumber(s.fta);
    totalFtm += safeNumber(s.ftm);

    totalSeconds += parseMinutesToSeconds(s.min);
  }

  const games = count;

  const avgPts = totalPts / games;
  const avgReb = totalReb / games;
  const avgAst = totalAst / games;
  const avgStl = totalStl / games;
  const avgBlk = totalBlk / games;
  const avgTov = totalTov / games;
  const avgFga = totalFga / games;
  const avgFgm = totalFgm / games;
  const avgFg3a = totalFg3a / games;
  const avgFg3m = totalFg3m / games;
  const avgFta = totalFta / games;
  const avgFtm = totalFtm / games;
  const avgSeconds = totalSeconds / games;

  const fgPct =
    totalFga > 0 ? round1((totalFgm / totalFga) * 100.0) : null;
  const fg3Pct =
    totalFg3a > 0 ? round1((totalFg3m / totalFg3a) * 100.0) : null;
  const ftPct =
    totalFta > 0 ? round1((totalFtm / totalFta) * 100.0) : null;

  return {
    games,
    pts: round1(avgPts),
    reb: round1(avgReb),
    ast: round1(avgAst),
    stl: round1(avgStl),
    blk: round1(avgBlk),
    turnover: round1(avgTov),

    fga: round1(avgFga),
    fgm: round1(avgFgm),
    fg3a: round1(avgFg3a),
    fg3m: round1(avgFg3m),
    fta: round1(avgFta),
    ftm: round1(avgFtm),

    fg_pct: fgPct,
    fg3_pct: fg3Pct,
    ft_pct: ftPct,

    minutes: secondsToMinutesString(avgSeconds),
  };
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Convert "MM:SS" or "M:SS" to seconds.
 * If format is weird or missing, return 0.
 */
function parseMinutesToSeconds(minStr) {
  if (!minStr || typeof minStr !== "string") return 0;

  const parts = minStr.split(":");
  if (parts.length !== 2) return 0;

  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);

  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;

  return minutes * 60 + seconds;
}

/**
 * Convert seconds to "MM.S" style string (1 decimal minute),
 * e.g. 32.5 means about 32.5 minutes.
 */
function secondsToMinutesString(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.0";
  const minutes = seconds / 60;
  return round1(minutes).toString();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function jsonResponseRaw(jsonString, status = 200) {
  return new Response(jsonString, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
