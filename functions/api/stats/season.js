// functions/api/stats/season.js
// Returns normalized season averages suitable for frontend consumption.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const playerId = url.searchParams.get("player_id");
  if (!playerId) {
    return new Response(
      JSON.stringify({ ok: false, error: "player_id is required" }),
      { status: 400 }
    );
  }

  const BDL_KEY = env.BDL_API_KEY;
  const SEASON = new Date().getFullYear() - 1; // BDL uses season ending year

  const apiUrl = `https://api.balldontlie.io/v2/season_averages?season=${SEASON}&player_ids[]=${playerId}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "Authorization": BDL_KEY,
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `BDL responded with status ${res.status}`,
        }),
        { status: 500 }
      );
    }

    const raw = await res.json();
    const row = raw?.data?.[0] || {};

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
      ok: true,
      season: SEASON,
      averages: {
        pts: pts,
        reb: reb,
        ast: ast,
        pra: pra,
        fg3m: fg3m,
      },
    };

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.toString() }),
      { status: 500 }
    );
  }
}
