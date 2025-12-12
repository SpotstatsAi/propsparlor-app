// propsparlor-app/scripts/games-today-ui.js
// Today's Games UI renderer.
// Fixes the regression where Tipoff showed TWO timestamps and CTA buttons rendered white/default.

(function () {
  const ENDPOINT = "/api/stats/games-today";

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function isLikelyISODateString(value) {
    if (!value) return false;
    const s = String(value).trim();
    // quick heuristic: ISO-looking with 'T' and 'Z'
    return s.includes("T") && s.endsWith("Z") && s.length >= 16;
  }

  function matchupLabel(game) {
    const away =
      (game?.visitor_team?.abbreviation ||
        game?.away_team?.abbreviation ||
        game?.away_team_abbr ||
        "AWY").toString().toUpperCase();

    const home =
      (game?.home_team?.abbreviation ||
        game?.home_team_abbr ||
        "HME").toString().toUpperCase();

    return `${away} @ ${home}`;
  }

  function pickFirstDate(game) {
    // Choose ONE best date/time field only (no concatenation).
    const candidates = [
      game?.start_time,
      game?.startTime,
      game?.scheduled,
      game?.date,
      game?.tipoff,
      game?.tipoff_time,
    ];

    for (const c of candidates) {
      if (!c) continue;
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  }

  function formatTipoff(game) {
    const d = pickFirstDate(game);
    if (!d) return "TBD";

    // Clean, readable local time (prevents ugly ISO strings)
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatStatus(game) {
    // Prefer true status fields if present
    const candidates = [game?.status, game?.game_status, game?.state];

    for (const c of candidates) {
      if (!c) continue;
      const s = String(c).trim();
      if (!s) continue;

      // If backend accidentally put a date into status, treat as TBD
      if (isLikelyISODateString(s)) return "TBD";

      return s;
    }

    return "TBD";
  }

  function buildCTA(matchup) {
    const btn = document.createElement("button");
    btn.type = "button";

    // CRITICAL: ensures neon styling (prevents white/default button)
    btn.className = "games-table-cta";

    btn.textContent = "Players & Stats";

    btn.addEventListener("click", () => {
      try {
        localStorage.setItem("pp:selectedGame", matchup);
      } catch (_) {}

      if (window.PropsParlor && typeof window.PropsParlor.openPlayersForGame === "function") {
        window.PropsParlor.openPlayersForGame(matchup);
      }
    });

    return btn;
  }

  function buildRow(game) {
    const tr = document.createElement("tr");

    const matchup = matchupLabel(game);
    const tipoff = formatTipoff(game);
    const status = formatStatus(game);

    const tdMatchup = document.createElement("td");
    tdMatchup.textContent = matchup;

    const tdTipoff = document.createElement("td");
    // FIX: tipoff is ONE formatted value only (no concatenation)
    tdTipoff.textContent = tipoff;

    const tdStatus = document.createElement("td");
    tdStatus.textContent = status;

    const tdCTA = document.createElement("td");
    tdCTA.style.textAlign = "right";
    tdCTA.appendChild(buildCTA(matchup));

    tr.appendChild(tdMatchup);
    tr.appendChild(tdTipoff);
    tr.appendChild(tdStatus);
    tr.appendChild(tdCTA);

    return tr;
  }

  async function loadGamesToday() {
    const loading = $("games-today-loading");
    const error = $("games-today-error");
    const empty = $("games-today-empty");
    const wrapper = $("games-today-wrapper");
    const body = $("games-today-body");

    show(loading, true);
    show(error, false);
    show(empty, false);
    show(wrapper, false);

    if (body) body.innerHTML = "";

    try {
      const res = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json || json.ok === false) {
        console.error("games-today error", res.status, json);
        show(loading, false);
        show(error, true);
        return;
      }

      const games = json.data?.games || json.games || json.data || [];
      if (!Array.isArray(games) || games.length === 0) {
        show(loading, false);
        show(empty, true);
        return;
      }

      games.forEach((g) => {
        if (!body) return;
        body.appendChild(buildRow(g));
      });

      show(loading, false);
      show(wrapper, true);
    } catch (e) {
      console.error("Failed to load games today", e);
      show(loading, false);
      show(error, true);
    }
  }

  document.addEventListener("DOMContentLoaded", loadGamesToday);
})();
