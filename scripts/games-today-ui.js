// propsparlor-app/scripts/games-today-ui.js
// Renders Today's Games table and wires "Players & Stats" CTA into Players view.

(function () {
  const ENDPOINT = "/api/stats/games-today";

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function toMatchupLabel(game) {
    const away = (game?.visitor_team?.abbreviation || game?.away_team?.abbreviation || "AWY").toUpperCase();
    const home = (game?.home_team?.abbreviation || "HME").toUpperCase();
    return `${away} @ ${home}`;
  }

  function toTipoff(game) {
    const raw =
      game?.date ||
      game?.start_time ||
      game?.startTime ||
      game?.scheduled ||
      null;

    if (!raw) return "TBD";

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "TBD";

    // Keep it simple and consistent; you can localize later
    return d.toISOString();
  }

  function toStatus(game) {
    // Use whatever field is available; fall back cleanly
    const s =
      game?.status ||
      game?.game_status ||
      game?.state ||
      null;

    return s ? String(s) : "TBD";
  }

  function buildRow(game) {
    const tr = document.createElement("tr");

    const matchup = toMatchupLabel(game);
    const tipoff = toTipoff(game);
    const status = toStatus(game);

    const tdMatchup = document.createElement("td");
    tdMatchup.textContent = matchup;

    const tdTip = document.createElement("td");
    tdTip.textContent = tipoff;

    const tdStatus = document.createElement("td");
    tdStatus.textContent = status;

    const tdCta = document.createElement("td");
    tdCta.style.textAlign = "right";

    // IMPORTANT: apply your styled class so it doesn't render white/default
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "games-table-cta";
    btn.textContent = "Players & Stats";

    btn.addEventListener("click", () => {
      // Persist selection so Players view can show "From Today's Games"
      try {
        localStorage.setItem("pp:selectedGame", matchup);
      } catch (_) {}

      // Jump to Players view and pre-select matchup
      if (window.PropsParlor && typeof window.PropsParlor.openPlayersForGame === "function") {
        window.PropsParlor.openPlayersForGame(matchup);
      } else {
        console.warn("PropsParlor.openPlayersForGame is not available yet.");
      }
    });

    tdCta.appendChild(btn);

    tr.appendChild(tdMatchup);
    tr.appendChild(tdTip);
    tr.appendChild(tdStatus);
    tr.appendChild(tdCta);

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
