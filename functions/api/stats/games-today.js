// functions/api/stats/games-today.js
// Route: GET /api/stats/games-today
//
// Calls BDL: GET https://api.balldontlie.io/v1/games?dates[]=YYYY-MM-DD&per_page=100
// IMPORTANT: Uses America/New_York "today" to match NBA slate expectations (not UTC).
// Uses KV: PROPSPARLOR_BDL_CACHE (10 min TTL)

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

function jsonRaw(payload, status = 200) {
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

// Get YYYY-MM-DD in America/New_York (avoids UTC day rollover issues)
function todayInET() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;

  return `${y}-${m}-${d}`;
}

export async function onRequest(context) {
  const { env } = context;

  const today = todayInET();
  const cacheKey = `games-today:${today}`;

  // KV → try cache first
  try {
    const cached = await env.PROPSPARLOR_BDL_CACHE.get(cacheKey);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        if (obj && typeof obj === "object") {
          obj.cache_source = "kv";
          return json(obj, 200);
        }
      } catch {
        // If parsing fails, return raw cached JSON string
      }
      return jsonRaw(cached, 200);
    }
  } catch (err) {
    console.error("KV get error (games-today):", err);
  }

  // KV miss → call BDL
  try {
    const url = new URL("/v1/games", BASE_URL);
    url.searchParams.append("dates[]", today);
    url.searchParams.set("per_page", "100");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: env.BDL_API_KEY, // no Bearer
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("BDL games-today error:", response.status, errorText);

      return json(
        {
          ok: false,
          error: {
            source: "BDL",
            status: response.status,
            message: "Failed to fetch games from BallDontLie.",
            details: errorText || null,
          },
        },
        502
      );
    }

    const bdl = await response.json().catch(() => null);
    const rows = Array.isArray(bdl?.data) ? bdl.data : [];

    const cleanedGames = rows.map((g) => ({
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
      meta: bdl?.meta || null,
      cache_source: "live",
    };

    const payload = JSON.stringify(payloadObj, null, 2);

    // Cache 10 minutes
    try {
      await env.PROPSPARLOR_BDL_CACHE.put(cacheKey, payload, {
        expirationTtl: 600,
      });
    } catch (err) {
      console.error("KV put error (games-today):", err);
    }

    return jsonRaw(payload, 200);
  } catch (err) {
    console.error("Unexpected error in games-today:", err);
    return json(
      {
        ok: false,
        error: {
          source: "worker",
          message: "Unexpected error in games-today.",
        },
      },
      500
    );
  }
}
