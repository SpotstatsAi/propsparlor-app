// functions/games-today.js
//
// Route:  GET /api/games-today
//
// Uses your BDL_API_KEY environment variable to fetch today's NBA games
// from BallDontLie and returns a cleaned list of games.

export async function onRequest(context) {
  const { env } = context;

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        error: "Missing BDL_API_KEY environment variable on Cloudflare Pages.",
      },
      500
    );
  }

  try {
    // Compute today's date in America/New_York, formatted as YYYY-MM-DD
    const today = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today); // en-CA gives YYYY-MM-DD

    const url = `https://api.balldontlie.io/v1/games?per_page=100&dates[]=${todayStr}`;

    const bdlResponse = await fetch(url, {
      headers: {
        Authorization: apiKey,
      },
    });

    if (!bdlResponse.ok) {
      const errorText = await safeText(bdlResponse);
      return jsonResponse(
        {
          error: "Error calling BallDontLie games endpoint.",
          status: bdlResponse.status,
          body: errorText,
        },
        bdlResponse.status
      );
    }

    const bdlJson = await safeJson(bdlResponse);

    const gamesRaw = Array.isArray(bdlJson?.data) ? bdlJson.data : [];

    // Clean the data for frontend use
    const games = gamesRaw.map((g) => {
      const home = g.home_team || {};
      const visitor = g.visitor_team || {};

      // Convert the UTC datetime from BDL into an Eastern tipoff time string
      let tipoff_est = null;
      if (g.datetime) {
        try {
          const dt = new Date(g.datetime);
          tipoff_est = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }).format(dt);
        } catch (e) {
          // Fallback to status if datetime parsing fails
          tipoff_est = g.status || null;
        }
      } else if (g.status) {
        // Pre-game status like "7:00 pm ET"
        tipoff_est = g.status;
      }

      return {
        id: g.id,
        season: g.season,
        date: g.date,
        datetime_utc: g.datetime || null,
        status: g.status,
        tipoff_est,
        postseason: g.postseason,
        home_team: {
          id: home.id,
          abbreviation: home.abbreviation,
          full_name: home.full_name,
          city: home.city,
          conference: home.conference,
          division: home.division,
        },
        visitor_team: {
          id: visitor.id,
          abbreviation: visitor.abbreviation,
          full_name: visitor.full_name,
          city: visitor.city,
          conference: visitor.conference,
          division: visitor.division,
        },
      };
    });

    const result = {
      date: todayStr,
      count: games.length,
      games,
    };

    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse(
      {
        error: "Unexpected error in /api/games-today.",
        details: String(err),
      },
      500
    );
  }
}

// Helper to return JSON with CORS so the frontend can call this from the browser.
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Safely read response text (in case BDL returns non-JSON error body)
async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

// Safely parse JSON, with fallback for invalid JSON bodies.
async function safeJson(response) {
  const text = await safeText(response);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
