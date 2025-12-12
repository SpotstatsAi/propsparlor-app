// functions/games-today.js

export async function onRequest(context) {
  const { env } = context;

  // 1) Compute today's date in YYYY-MM-DD (Cloudflare runs in UTC)
  const now = new Date();
  const today = now.toISOString().slice(0, 10); // e.g. "2025-12-11"

  // 2) Build a cache key specific to "games today"
  const cacheKey = `games-today:${today}`;

  // 3) Try KV cache first
  try {
    const cached = await env.PROPSPARLOR_BDL_CACHE.get(cacheKey);

    if (cached) {
      // Return cached JSON directly
      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err) {
    // If KV fails for any reason, just fall through and hit BDL
    console.error("KV get error (games-today):", err);
  }

  // 4) Cache miss → call BDL
  try {
    const url = new URL("https://api.balldontlie.io/v2/games");
    url.searchParams.set("dates[]", today);
    url.searchParams.set("per_page", "100");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.BDL_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("BDL games-today error:", response.status, errorText);

      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            source: "BDL",
            status: response.status,
            message: "Failed to fetch games from BallDontLie.",
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const json = await response.json();

    // 5) Clean the response into the format your frontend expects
    const cleanedGames = (json.data || []).map((g) => ({
      id: g.id,
      date: g.date,
      season: g.season,
      status: g.status,
      period: g.period,
      time: g.time,
      postseason: g.postseason,
      home_team: g.home_team,
      visitor_team: g.visitor_team,
      home_team_score: g.home_team_score,
      visitor_team_score: g.visitor_team_score,
    }));

    const payload = JSON.stringify(
      {
        ok: true,
        date: today,
        games: cleanedGames,
      },
      null,
      2
    );

    // 6) Save to KV with TTL (e.g., 10 minutes = 600 seconds)
    try {
      await env.PROPSPARLOR_BDL_CACHE.put(cacheKey, payload, {
        expirationTtl: 600, // 10 minutes
      });
    } catch (err) {
      console.error("KV put error (games-today):", err);
      // If KV write fails, we still return the fresh payload
    }

    // 7) Return the fresh payload
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Unexpected error in games-today:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          source: "worker",
          message: "Unexpected error in games-today.",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
