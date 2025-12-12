// functions/api/players/search.js

const BASE_URL = "https://api.balldontlie.io";

/**
 * GET /api/players/search?q=lebron
 *
 * Wraps BDL players search with KV caching.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  // If query is empty or super short, just return empty list (cheap no-op)
  if (!q || q.length < 2) {
    const payload = JSON.stringify(
      {
        ok: true,
        query: q,
        players: [],
        meta: null,
      },
      null,
      2
    );

    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Normalize for cache key
  const normalizedQuery = q.toLowerCase();
  const cacheKey = `players-search:${normalizedQuery}`;

  // 1) Try KV cache first
  try {
    const cached = await env.PROPSPARLOR_BDL_CACHE.get(cacheKey);

    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch (err) {
    console.error("KV get error (players-search):", err);
    // fall through and hit BDL anyway
  }

  // 2) Cache miss → call BDL players endpoint
  try {
    // Per docs: GET https://api.balldontlie.io/v1/players?search=...
    const bdlUrl = new URL("/v1/players", BASE_URL);
    bdlUrl.searchParams.set("search", q);
    bdlUrl.searchParams.set("per_page", "50"); // a bit higher so search feels complete

    const response = await fetch(bdlUrl.toString(), {
      method: "GET",
      headers: {
        // BDL expects Authorization: YOUR_API_KEY
        Authorization: env.BDL_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("BDL players-search error:", response.status, errorText);

      return new Response(
        JSON.stringify(
          {
            ok: false,
            error: {
              source: "BDL",
              status: response.status,
              message: "Failed to fetch players from BallDontLie.",
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

    // 3) Clean response for frontend
    const cleanedPlayers = (json.data || []).map((p) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name} ${p.last_name}`.trim(),
      position: p.position,
      height: p.height,
      weight: p.weight,
      jersey_number: p.jersey_number,
      college: p.college,
      country: p.country,
      draft_year: p.draft_year,
      draft_round: p.draft_round,
      draft_number: p.draft_number,
      team: p.team || null,
    }));

    const payload = JSON.stringify(
      {
        ok: true,
        query: q,
        players: cleanedPlayers,
        meta: json.meta || null,
      },
      null,
      2
    );

    // 4) Store in KV with a long TTL (7 days)
    try {
      await env.PROPSPARLOR_BDL_CACHE.put(cacheKey, payload, {
        expirationTtl: 60 * 60 * 24 * 7, // 7 days
      });
    } catch (err) {
      console.error("KV put error (players-search):", err);
      // still return fresh data
    }

    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Unexpected error in players-search:", err);
    return new Response(
      JSON.stringify(
        {
          ok: false,
          error: {
            source: "worker",
            message: "Unexpected error in players-search.",
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
