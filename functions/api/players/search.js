// /functions/api/players/search.js
// Route: GET /api/players/search?query=lebron&cursor=...&per_page=...

function jsonResponse(body, init = {}) {
  const status = init.status || 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

function errorResponse(status, code, message) {
  return jsonResponse(
    {
      ok: false,
      error: { code, message },
    },
    { status }
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") || "").trim();
  const cursor = url.searchParams.get("cursor") || null;
  const perPageParam = url.searchParams.get("per_page");

  if (!query || query.length < 2) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Query parameter 'query' is required and must be at least 2 characters."
    );
  }

  const perPage = (() => {
    const fallback = 25;
    if (!perPageParam) return fallback;
    const n = Number(perPageParam);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return fallback;
    return n;
  })();

  const bdlUrl = new URL("https://api.balldontlie.io/nba/v1/players");
  bdlUrl.searchParams.set("search", query);
  bdlUrl.searchParams.set("per_page", String(perPage));
  if (cursor) {
    bdlUrl.searchParams.set("cursor", cursor);
  }

  const apiKey = env.BDL_API_KEY;
  if (!apiKey) {
    return errorResponse(
      500,
      "CONFIG_ERROR",
      "BDL_API_KEY is not configured in the environment."
    );
  }

  let upstream;
  try {
    upstream = await fetch(bdlUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch {
    return errorResponse(
      502,
      "UPSTREAM_FETCH_FAILED",
      "Failed to reach BALLDONTLIE players endpoint."
    );
  }

  if (!upstream.ok) {
    return errorResponse(
      502,
      "UPSTREAM_ERROR",
      `BALLDONTLIE players endpoint returned status ${upstream.status}.`
    );
  }

  let raw;
  try {
    raw = await upstream.json();
  } catch {
    return errorResponse(
      502,
      "UPSTREAM_PARSE_FAILED",
      "Unable to parse BALLDONTLIE players response as JSON."
    );
  }

  const rawPlayers = Array.isArray(raw.data) ? raw.data : [];
  const players = rawPlayers.map((p) => {
    const team = p.team || {};
    const first = p.first_name || "";
    const last = p.last_name || "";
    const full = `${first} ${last}`.trim();

    return {
      id: p.id,
      first_name: first,
      last_name: last,
      full_name: full,
      position: p.position || null,
      jersey_number: p.jersey_number ?? null,
      height: p.height ?? null,
      weight: p.weight ?? null,
      team: {
        id: team.id ?? null,
        name: team.full_name ?? team.name ?? null,
        full_name: team.full_name ?? team.name ?? null,
        abbreviation: team.abbreviation ?? null,
        city: team.city ?? null,
        conference: team.conference ?? null,
        division: team.division ?? null,
      },
    };
  });

  const meta = raw.meta || {};

  return jsonResponse({
    ok: true,
    query,
    count: players.length,
    data: players,
    meta: {
      source: "balldontlie",
      sport: "nba",
      endpoint: "players.search",
      cursor: meta.cursor ?? null,
      next_cursor: meta.next_cursor ?? null,
    },
  });
}
