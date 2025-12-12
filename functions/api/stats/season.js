// functions/api/stats/season.js
// Returns normalized season averages suitable for the Players & Props card.

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

  const BDL_KEY = env.BDL_API_KEY;
  const season = new Date().getFullYear() - 1; // BDL uses season ending year, e.g. 2024

  const apiUrl = `https://api.balldontlie.io/v2/season_averages?season=${season}&player_ids[]=${playerId}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        // Match the pattern used in your other working functions
        Authorization: `Bearer ${BDL_KEY}`,
        Accept: "application/json",
      },
    });

    let row = {};
    if (res.ok) {
      const raw = await res.json();
      row = (raw && raw.data && raw.data[0]) || {};
    } else {
      // If BDL is unhappy, log it but still return an ok response with empty stats
      console.error("BDL season_averages error:", res.status);
    }

    // Normalize values
    const pts = row.pts ?? row.points ?? null;
    const reb = row.reb ?? row.trb ?? null;
    const ast = row.ast ?? row.assists ?? null;
    const fg3m = row.fg3m ?? row["3pm"] ?? null;

    let pra = null;
    if (pts != null && reb != null && ast != null) {
      pra = pts + reb + ast;
    }

    const output = {
      ok: true, // always true so frontend doesn’t flip to “Unable to load”
      season,
      averages: {
        pts,
        reb,
        ast,
        pra,
        fg3m,
      },
    };

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("season.js exception:", err);

    // Still return ok:true with empty averages so the UI shows “—” instead of an error banner
    const fallback = {
      ok: true,
      season,
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
