// propsparlor-app/scripts/games-today-ui.js
// Today’s Games UI: renders the slate table and wires Players & Stats -> Players view.
// Fixes: (1) ensures CTA uses .games-table-cta styling (no white default buttons)
//        (2) cleans tipoff rendering so you don't see duplicated timestamps

(function () {
  const ENDPOINT = "/api/stats/games-today";

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function safeText(v, fallback = "—") {
    const s = (v ?? "").toString().trim();
    return s.length ? s : fallback;
  }

  function parseDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatTipoff(game) {
    // Prefer a single actual start time if present
    const candidates = [
      game?.date,
      game?.start_time,
      game?.startTime,
      game?.scheduled,
      game?.tipoff,
      game?.tipoff_time,
    ];

    for (const c of candidates) {
      const d = parseDate(c);
      if (!d) continue;

      // Format: "Dec 12, 7:30 PM" (local)
      return d.toLocaleString(undefined, {
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return "TBD";
  }

  function formatStatus(game) {
    // Keep simple: if API gives a status string, show it; else TBD.
    const candidates = [game?.status, game?.game_status, game?.state];
    for (const c of candidates) {
      const s = (c ?? "").toString().trim();
      if (s) return s;
    }
    return "TBD";
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

  function buildCTA(matchup) {
    const btn = document.createElement("button");
    btn.type = "button";

    // CRITICAL: this is what prevents the white default button
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
    tdMatchup.textContent = safeText(matchup);

    const tdTipoff = document.createElement("td");
    tdTipoff.textContent = safeText(tipoff);

    const tdStatus = document.createElement("td");
    tdStatus.textContent = safeText(status);

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
        console.error("games-today upstream error", res.status, json);
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
      console.error("games-today fetch failed", e);
      show(loading, false);
      show(error, true);
    }
  }

  document.addEventListener("DOMContentLoaded", loadGamesToday);
})();
