// propsparlor-app/functions/api/stats/season.js
// Returns core season averages for a player.
// Contract (frontend expects):
// { ok: true, data: { player_id, season, pts, reb, ast, pra, fg3m } }

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function toNumber(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function firstNonNull(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env || !env.BDL_API_KEY) {
      return jsonResponse(
        { ok: false, error: { code: "CONFIG", message: "Missing env.BDL_API_KEY" } },
        500
      );
    }

    const url = new URL(request.url);

    // Accept both player_id and playerId for safety
    const playerIdRaw =
      url.searchParams.get("player_id") ||
      url.searchParams.get("playerId") ||
      url.searchParams.get("id");

    const player_id = Number(playerIdRaw);
    if (!Number.isFinite(player_id)) {
      return jsonResponse(
        { ok: false, error: { code: "BAD_REQUEST", message: "player_id is required" } },
        400
      );
    }

    // Default to current season year (calendar year heuristic),
    // but allow explicit override via ?season=YYYY
    const seasonRaw = url.searchParams.get("season");
    const now = new Date();
    const defaultSeason = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    const season = Number(seasonRaw ?? defaultSeason);

    // BDL v2 season stats endpoint (NBA)
    // Uses array params: player_ids[]=X and seasons[]=YYYY
    const upstream = new URL("https://api.balldontlie.io/v2/stats/season");
    upstream.searchParams.append("player_ids[]", String(player_id));
    upstream.searchParams.append("seasons[]", String(season));
    upstream.searchParams.append("postseason", "false");

    const res = await fetch(upstream.toString(), {
      headers: {
        Authorization: env.BDL_API_KEY,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (!res.ok || !data) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `BDL returned ${res.status}`,
            details: data || text,
          },
        },
        502
      );
    }

    // BDL typically returns { data: [ ... ] }
    const row = Array.isArray(data.data) ? data.data[0] : null;

    if (!row) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "NO_DATA",
            message: "No season stats returned for this player/season.",
          },
        },
        404
      );
    }

    // Normalize fields (BDL naming can vary by product/version)
    const pts = toNumber(firstNonNull(row.pts, row.points, row.pts_pg, row.points_per_game));
    const reb = toNumber(firstNonNull(row.reb, row.rebounds, row.reb_pg, row.rebounds_per_game));
    const ast = toNumber(firstNonNull(row.ast, row.assists, row.ast_pg, row.assists_per_game));

    // 3PM (fg3m is common)
    const fg3m = toNumber(
      firstNonNull(
        row.fg3m,
        row.fg3m_pg,
        row.three_pm,
        row.three_pt_made,
        row.three_pt_made_pg,
        row.three_pointers_made
      )
    );

    // PRA is computed (never rely on upstream naming)
    const pra =
      pts !== null && reb !== null && ast !== null ? pts + reb + ast : null;

    // IMPORTANT: keep the exact flat contract your UI expects
    return jsonResponse({
      ok: true,
      data: {
        player_id,
        season,
        pts: round1(pts),
        reb: round1(reb),
        ast: round1(ast),
        pra: round1(pra),
        fg3m: round1(fg3m),
      },
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          message: err?.message || "Unhandled error",
        },
      },
      500
    );
  }
}
