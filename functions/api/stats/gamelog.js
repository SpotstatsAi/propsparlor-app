// functions/api/stats/gamelog.js
// Route: GET /api/stats/gamelog?player_id=237&limit=25&season=2024
//
// Returns recent game-by-game rows for charting.
// Uses BallDontLie: GET /v1/stats with player_ids[] (+ optional seasons[]) and cursor pagination.
// Authorization header is "Authorization: YOUR_API_KEY" (NO Bearer).

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

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchRows({ apiKey, playerId, season, limit }) {
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

  // Sort newest -> oldest, then take limit
  out.sort((a, b) => {
    const ad = a?.game?.date ? Date.parse(a.game.date) : 0;
    const bd = b?.game?.date ? Date.parse(b.game.date) : 0;
    return bd - ad;
  });

  return out.slice(0, limit);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playerIdRaw = url.searchParams.get("player_id");
  const limitRaw = url.searchParams.get("limit");
  const seasonRaw = url.searchParams.get("season");

  const player_id = playerIdRaw ? parseInt(playerIdRaw, 10) : NaN;
  if (!Number.isFinite(player_id) || player_id <= 0) {
    return json({ ok: false, error: { code: "BAD_REQUEST", message: "player_id is required" } }, 400);
  }

  const limit = limitRaw ? parseInt(limitRaw, 10) : 25;
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 5), 100) : 25;

  const season = seasonRaw ? parseInt(seasonRaw, 10) : NaN;
  const seasonNum = Number.isFinite(season) ? season : null;

  const apiKey = env?.BDL_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: { code: "NO_API_KEY", message: "BDL_API_KEY is not configured." } }, 500);
  }

  try {
    const rows = await fetchRows({
      apiKey,
      playerId: player_id,
      season: seasonNum,
      limit: safeLimit,
    });

    const cleaned = rows.map((r) => {
      const gameDate =
        r?.game?.date || r?.game?.start_time || r?.game?.start_date || null;

      return {
        id: r?.id ?? null,
        game: {
          id: r?.game?.id ?? null,
          date: gameDate,
          status: r?.game?.status ?? null,
          home_team: r?.game?.home_team?.abbreviation ?? null,
          visitor_team: r?.game?.visitor_team?.abbreviation ?? null,
        },
        team: {
          id: r?.team?.id ?? null,
          abbreviation: r?.team?.abbreviation ?? null,
        },
        player: {
          id: r?.player?.id ?? null,
          first_name: r?.player?.first_name ?? null,
          last_name: r?.player?.last_name ?? null,
        },
        min: r?.min ?? null,
        pts: num(r?.pts),
        reb: num(r?.reb),
        ast: num(r?.ast),
        fg3m: num(r?.fg3m),
      };
    });

    return json({
      ok: true,
      player_id,
      season: seasonNum,
      limit: safeLimit,
      gamelog: cleaned,
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: {
          code: "UPSTREAM_ERROR",
          message: `BallDontLie returned an error.`,
          status: e?.status || 502,
          details: e?.detail || null,
        },
      },
      502
    );
  }
}
