// functions/api/stats/gamelog.js
// Returns recent game-by-game stats for a player (for charting).
// Uses BDL GOAT tier NBA endpoint: /nba/v1/stats with player_ids[] + per_page.
//
// Usage:
//   /api/stats/gamelog?player_id=237&limit=25
//
// Notes:
// - We sort by game.date DESC on our side so charting is stable.
// - This endpoint is intentionally lightweight: it returns only what the UI needs.

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    const playerIdRaw = url.searchParams.get("player_id");
    const limitRaw = url.searchParams.get("limit");

    const player_id = playerIdRaw ? parseInt(playerIdRaw, 10) : NaN;
    const limit = limitRaw ? parseInt(limitRaw, 10) : 25;

    if (!Number.isFinite(player_id) || player_id <= 0) {
      return json(
        { ok: false, error: { code: "BAD_REQUEST", message: "player_id is required" } },
        400
      );
    }

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 5), 100) : 25;

    const endpoint = new URL("https://api.balldontlie.io/nba/v1/stats");
    endpoint.searchParams.set("per_page", String(safeLimit));
    endpoint.searchParams.append("player_ids[]", String(player_id));

    const res = await fetch(endpoint.toString(), {
      headers: {
        Authorization: env.BDL_API_KEY,
        Accept: "application/json",
      },
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload) {
      return json(
        {
          ok: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `BallDontLie returned status ${res.status}.`,
            status: res.status,
          },
          upstream: payload,
        },
        502
      );
    }

    const rows = Array.isArray(payload.data) ? payload.data : [];

    const cleaned = rows
      .map((r) => {
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
      })
      .sort((a, b) => {
        const ad = a?.game?.date ? Date.parse(a.game.date) : 0;
        const bd = b?.game?.date ? Date.parse(b.game.date) : 0;
        return bd - ad;
      });

    return json({
      ok: true,
      player_id,
      limit: safeLimit,
      gamelog: cleaned,
      meta: payload.meta || null,
    });
  } catch (err) {
    return json(
      { ok: false, error: { code: "SERVER_ERROR", message: String(err?.message || err) } },
      500
    );
  }
}

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
