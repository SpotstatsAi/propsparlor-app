// scripts/games-today-ui.js
// Thread 4/7 – Today’s Games table + hook into Players view

(function () {
  const API_URL = "/api/stats/games-today";

  function $(id) {
    return document.getElementById(id);
  }

  function setVisibility(el, visible) {
    if (!el) return;
    el.style.display = visible ? "" : "none";
  }

  function formatMatchup(game) {
    const home =
      (game.home_team && (game.home_team.abbreviation || game.home_team.name)) ||
      game.home_abbr ||
      game.home ||
      "HOME";

    const away =
      (game.visitor_team &&
        (game.visitor_team.abbreviation || game.visitor_team.name)) ||
      game.away_abbr ||
      game.away ||
      "AWAY";

    return `${away} @ ${home}`;
  }

  function formatTipoff(game) {
    // The worker might send tipoff_local, tipoff, or a generic time string
    return (
      game.tipoff_local ||
      game.tipoff ||
      game.start_time_local ||
      game.game_time ||
      "TBD"
    );
  }

  function formatStatus(game) {
    return game.status || "Scheduled";
  }

  function createCtaButton(matchupLabel, tipoffText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "games-table-cta";
    btn.textContent = "Players & Stats";

    btn.addEventListener("click", () => {
      const label = tipoffText && tipoffText !== "TBD"
        ? `${matchupLabel} · ${tipoffText}`
        : matchupLabel;

      if (
        window.PropsParlor &&
        typeof window.PropsParlor.openPlayersForGame === "function"
      ) {
        window.PropsParlor.openPlayersForGame(label);
      } else {
        // Fallback: at least switch to the Players tab if helper is missing
        const playersNav = document.querySelector(
          '.nav-item[data-view="players"]'
        );
        if (playersNav) {
          playersNav.click();
        }
      }
    });

    return btn;
  }

  function renderGamesTable(games) {
    const body = $("games-today-body");
    const wrapper = $("games-today-wrapper");
    const emptyEl = $("games-today-empty");

    if (!body || !wrapper || !emptyEl) return;

    body.innerHTML = "";

    if (!Array.isArray(games) || games.length === 0) {
      setVisibility(wrapper, false);
      setVisibility(emptyEl, true);
      return;
    }

    games.forEach((game) => {
      const tr = document.createElement("tr");

      const matchupText = formatMatchup(game);
      const tipoffText = formatTipoff(game);
      const statusText = formatStatus(game);

      const matchupTd = document.createElement("td");
      matchupTd.textContent = matchupText;

      const tipoffTd = document.createElement("td");
      tipoffTd.textContent = tipoffText;

      const statusTd = document.createElement("td");
      statusTd.textContent = statusText;

      const ctaTd = document.createElement("td");
      ctaTd.style.textAlign = "right";
      const ctaBtn = createCtaButton(matchupText, tipoffText);
      ctaTd.appendChild(ctaBtn);

      tr.appendChild(matchupTd);
      tr.appendChild(tipoffTd);
      tr.appendChild(statusTd);
      tr.appendChild(ctaTd);

      body.appendChild(tr);
    });

    setVisibility(emptyEl, false);
    setVisibility(wrapper, true);
  }

  async function loadGamesToday() {
    const loadingEl = $("games-today-loading");
    const errorEl = $("games-today-error");
    const emptyEl = $("games-today-empty");
    const wrapper = $("games-today-wrapper");

    if (loadingEl) loadingEl.textContent = "Loading today's games…";
    setVisibility(loadingEl, true);
    setVisibility(errorEl, false);
    setVisibility(emptyEl, false);
    setVisibility(wrapper, false);

    try {
      const res = await fetch(API_URL, {
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) {
        throw new Error("Non-200 from games-today API");
      }

      const payload = await res.json();

      if (!payload || payload.ok === false) {
        throw new Error(payload && payload.error ? payload.error : "API error");
      }

      const games = payload.data || payload.games || [];
      renderGamesTable(games);
      setVisibility(loadingEl, false);
    } catch (err) {
      console.error("Failed to load games today:", err);
      if (errorEl) {
        errorEl.textContent =
          "Unable to load today's games. Please refresh to try again.";
      }
      setVisibility(loadingEl, false);
      setVisibility(errorEl, true);
      setVisibility(emptyEl, false);
      setVisibility(wrapper, false);
    }
  }

  document.addEventListener("DOMContentLoaded", loadGamesToday);
})();
