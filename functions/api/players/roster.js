// functions/api/players/roster.js
//
// Route:
//   GET /api/players/roster?team_id=14
//   GET /api/players/roster?abbr=LAL
//
// Fetches an NBA roster (current-season contracts) for a team.
// - If team_id is provided, it is used directly.
// - Otherwise, abbr is resolved -> team_id via /v1/teams (cached in KV).
//
// IMPORTANT:
// We DO NOT use /v1/players?team_ids[] for "roster" because it can include historical players.
// Instead, we use /v1/contracts/teams (season-aware roster approximation).
//
// Uses KV caching to reduce BDL calls.

const BASE_URL = "https://api.balldontlie.io";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

async function kvGet(env, key) {
  try {
    return await env.PROPSPARLOR_BDL_CACHE.get(key);
  } catch (err) {
    console.error("KV get error:", key, err);
    return null;
  }
}

async function kvPut(env, key, value, ttlSeconds) {
  try {
    await env.PROPSPARLOR_BDL_CACHE.put(key, value, { expirationTtl: ttlSeconds });
  } catch (err) {
    console.error("KV put error:", key, err);
  }
}

function normalizeAbbr(abbr) {
  return String(abbr || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
}

// NBA season "start year" heuristic:
// If we're in Jul–Dec, season = current year. If Jan–Jun, season = previous year.
function getSeasonStartYear(dateObj = new Date()) {
  const y = dateObj.getUTCFullYear();
  const m = dateObj.getUTCMonth() + 1; // 1-12
  return m >= 7 ? y : y - 1;
}

async function fetchTeamsMap({ env }) {
  const cacheKey = "nba:teams-map:v1";
  const cached = await kvGet(env, cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (obj && obj.ok && obj.map) return { ...obj, cache_source: "kv" };
    } catch {
      // ignore
    }
  }

  // Correct per docs: /v1/teams
  const url = new URL("/v1/teams", BASE_URL);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: env.BDL_API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return {
      ok: false,
      error: {
        source: "BDL",
        status: res.status,
        message: "Failed to fetch teams from BallDontLie.",
        details: errorText || null,
      },
    };
  }

  const data = await res.json().catch(() => null);
  const rows = Array.isArray(data?.data) ? data.data : [];

  const map = {};
  for (const t of rows) {
    const abbr = normalizeAbbr(t?.abbreviation);
    if (!abbr) continue;
    map[abbr] = {
      id: t?.id,
      abbreviation: abbr,
      full_name: t?.full_name || null,
      city: t?.city || null,
      name: t?.name || null,
      conference: t?.conference || null,
      division: t?.division || null,
    };
  }

  const payloadObj = { ok: true, map };
  await kvPut(env, cacheKey, JSON.stringify(payloadObj, null, 2), 60 * 60 * 24); // 24h
  return { ...payloadObj, cache_source: "live" };
}

function cleanPlayer(p) {
  const first = p?.first_name || "";
  const last = p?.last_name || "";
  const full = `${first} ${last}`.trim() || p?.name || null;

  return {
    id: p?.id ?? p?.player_id ?? null,
    first_name: p?.first_name || null,
    last_name: p?.last_name || null,
    full_name: full,
    position: p?.position || null,
    team: p?.team || null,
  };
}

function uniqById(players) {
  const seen = new Set();
  const out = [];
  for (const p of players) {
    const id = p?.id;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out;
}

async function fetchRosterByContracts({ env, teamId, seasonStartYear }) {
  const cacheKey = `nba:roster:contracts:team:${teamId}:season:${seasonStartYear}`;
  const cached = await kvGet(env, cacheKey);
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (obj && obj.ok) return { ...obj, cache_source: "kv" };
    } catch {
      // ignore
    }
  }

  // Correct per docs: /v1/contracts/teams
  const url = new URL("/v1/contracts/teams", BASE_URL);
  url.searchParams.set("team_id", String(teamId));
  url.searchParams.set("season", String(seasonStartYear)); // optional per docs; we set explicitly

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: env.BDL_API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return {
      ok: false,
      error: {
        source: "BDL",
        status: res.status,
        message: "Failed to fetch team contracts from BallDontLie.",
        details: errorText || null,
      },
    };
  }

  const data = await res.json().catch(() => null);
  const rows = Array.isArray(data?.data) ? data.data : [];

  // Docs show contracts include `player` object in many responses; handle safely.
  const cleaned = rows
    .map((row) => {
      const p = row?.player || null;
      if (p) return cleanPlayer(p);

      const pid = row?.player_id ?? null;
      if (!pid) return null;

      return {
        id: pid,
        first_name: null,
        last_name: null,
        full_name: `Player ${pid}`,
        position: null,
        team: null,
      };
    })
    .filter(Boolean);

  const payloadObj = {
    ok: true,
    team_id: Number(teamId),
    season: Number(seasonStartYear),
    players: uniqById(cleaned),
    meta: data?.meta || null,
  };

  await kvPut(env, cacheKey, JSON.stringify(payloadObj, null, 2), 60 * 60 * 6); // 6h
  return { ...payloadObj, cache_source: "live" };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const teamIdRaw = url.searchParams.get("team_id");
  const abbrRaw = url.searchParams.get("abbr");

  if (!env?.BDL_API_KEY) {
    return json(
      { ok: false, error: { code: "NO_API_KEY", message: "BDL_API_KEY is not configured." } },
      500
    );
  }
  if (!env?.PROPSPARLOR_BDL_CACHE) {
    return json(
      { ok: false, error: { code: "NO_KV", message: "PROPSPARLOR_BDL_CACHE is not configured." } },
      500
    );
  }

  let team = null;
  let teamId = null;

  if (teamIdRaw && /^\d+$/.test(teamIdRaw)) {
    teamId = Number(teamIdRaw);
    team = { id: teamId, abbreviation: null, full_name: null };
  } else {
    const abbr = normalizeAbbr(abbrRaw);
    if (!abbr) {
      return json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: "Provide `team_id` or `abbr` (example: /api/players/roster?abbr=LAL).",
          },
        },
        400
      );
    }

    const teamsMap = await fetchTeamsMap({ env });
    if (!teamsMap.ok) return json(teamsMap, 502);

    team = teamsMap.map?.[abbr] || null;
    if (!team || !team.id) {
      return json(
        { ok: false, error: { code: "TEAM_NOT_FOUND", message: `No team found for abbr "${abbr}".` } },
        404
      );
    }
    teamId = Number(team.id);
  }

  const seasonStartYear = getSeasonStartYear(new Date());
  const roster = await fetchRosterByContracts({ env, teamId, seasonStartYear });
  if (!roster.ok) return json(roster, 502);

  return json({
    ok: true,
    team,
    team_id: teamId,
    season: roster.season,
    players: roster.players || [],
    meta: roster.meta || null,
    cache_source: roster.cache_source || "live",
  });
}
