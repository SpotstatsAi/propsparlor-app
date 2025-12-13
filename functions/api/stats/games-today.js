// functions/api/stats/games-today.js

const BASE_URL = "https://api.balldontlie.io";

export async function onRequest(context) {
  const { env } = context;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const cacheKey = `games-today:${today}`;

  // KV → try cache first
  try {
    const cached = await env.PROPSPARLOR_BDL_CACHE.get(cacheKey);

    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (obj && typeof obj === "object") {
          obj.cache_source = "kv";
          const payload = JSON.stringify(obj, null, 2);
          return new Response(payload, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      } catch {
        // parsing failed, just return raw
      }

      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err) {
    console.error("KV get error (games-today):", err);
  }

  // KV miss → call BDL
  try {
    const url = new URL("/nba/v1/games", BASE_URL);
    url.searchParams.set("dates[]", today);
    url.searchParams.set("per_page", "100");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: env.BDL_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("BDL games-today error:", response.status, errorText);

      return new Response(
        JSON.stringify(
          {
            ok: false,
            error: {
              source: "BDL",
              status: response.status,
              message: "Failed to fetch games from BallDontLie.",
              details: errorText || null,
            },
          },
          null,
          2
        ),
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

    const payloadObj = {
      ok: true,
      date: today,
      games: cleanedGames,
      meta: json.meta || null,
      cache_source: "live",
    };

    const payload = JSON.stringify(payloadObj, null, 2);

    try {
      await env.PROPSPARLOR_BDL_CACHE.put(cacheKey, payload, {
        expirationTtl: 600,
      });
    } catch (err) {
      console.error("KV put error (games-today):", err);
    }

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
      JSON.stringify(
        {
          ok: false,
          error: {
            source: "worker",
            message: "Unexpected error in games-today.",
          },
        },
        null,
        2
      ),
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
