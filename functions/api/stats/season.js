// functions/api/stats/season.js
// NBA season averages via BALLDONTLIE v1 Season Averages (general / base).

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playerId = url.searchParams.get("player_id");
  if (!playerId) {
    return new Response(
      JSON.stringify({ ok: false, error: "player_id is required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "BDL_API_KEY missing in env" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // BDL uses the season *year* (e.g. 2024 for the 2023-24 season).
  // This matches what you were using before: currentYear - 1.
  const season = new Date().getFullYear() - 1;
  const seasonType = "regular";
  const category = "general";
  const type = "base";

  // Build the Season Averages URL per docs:
  // https://api.balldontlie.io/v1/season_averages/general?season=2024&season_type=regular&type=base&player_ids[]=246
  const apiUrl = new URL(
    `https://api.balldontlie.io/v1/season_averages/${category}`
  );
  apiUrl.searchParams.set("season", String(season));
  apiUrl.searchParams.set("season_type", seasonType);
  apiUrl.searchParams.set("type", type);
  apiUrl.searchParams.append("player_ids[]", String(playerId));

  try {
    const res = await fetch(apiUrl.toString(), {
      headers: {
        // Per docs: Authorization: YOUR_API_KEY (no Bearer)
        // https://nba.balldontlie.io/  → Authentication section
        Authorization: apiKey,
        Accept: "application/json",
      },
    });

    let json;
    try {
      json = await res.json();
    } catch (e) {
      console.error("season.js: failed to parse JSON", e);
      json = null;
    }

    if (!res.ok) {
      console.error("BDL season_averages error", res.status, json);
    }

    const row = json?.data?.[0] || null;
    const stats = row?.stats || {};

    const toNumberOrNull = (value) => {
      if (value === null || value === undefined) return null;
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) return null;
      return Number(num.toFixed(1)); // 1 decimal place, like you asked
    };

    const pickStat = (keys) => {
      for (const key of keys) {
        if (stats[key] !== undefined && stats[key] !== null) {
          return toNumberOrNull(stats[key]);
        }
      }
      return null;
    };

    // Try multiple possible field names so we’re robust to naming
    const pts = pickStat(["pts", "points"]);
    const reb = pickStat(["reb", "rebounds"]);
    const ast = pickStat(["ast", "assists"]);
    const fg3m = pickStat([
      "fg3m",
      "three_pointers_made",
      "three_point_field_goals_made",
      "3pm",
    ]);

    let pra = null;
    if (pts !== null && reb !== null && ast !== null) {
      pra = Number((pts + reb + ast).toFixed(1));
    }

    const payload = {
      ok: true,
      season,
      season_type: seasonType,
      category,
      type,
      player_id: Number(playerId),
      raw: row || null, // helpful while we’re validating, can remove later
      averages: {
        pts,
        reb,
        ast,
        pra,
        fg3m,
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("season.js exception:", err);

    // Still respond ok:true so the UI just shows "—" instead of the red error line.
    const fallback = {
      ok: true,
      season,
      season_type: "regular",
      category: "general",
      type: "base",
      player_id: Number(playerId),
      raw: null,
      averages: {
        pts: null,
        reb: null,
        ast: null,
        pra: null,
        fg3m: null,
      },
    };

    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
