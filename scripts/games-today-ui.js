// scripts/games-today-ui.js
// Wires the "Today's Games" view to /api/stats/games-today without touching layout.

(function () {
  // Use the existing Worker route: /api/stats/games-today
  const GAMES_TODAY_URL = "/api/stats/games-today";

  async function fetchGamesToday() {
    const res = await fetch(GAMES_TODAY_URL, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}`);
    }

    const data = await res.json();

    // Try to be flexible about the worker response shape.
    let games = [];
    if (Array.isArray(data.games)) {
      games = data.games;
    } else if (Array.isArray(data.data)) {
      games = data.data;
    } else if (Array.isArray(data.results)) {
      games = data.results;
    }

    if (!data.ok && !games.length) {
      const message =
        (data.error && (data.error.message || data.error.code)) ||
        "Unknown API error";
      throw new Error(message);
    }

    return games;
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function formatTipoff(dateStr) {
    if (!dateStr) return "TBD";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "TBD";

    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatMatchup(game) {
    const home =
      game.home_team?.abbreviation ||
      game.home_team?.name ||
      game.home_team?.full_name ||
      "HOME";
    const away =
      game.visitor_team?.abbreviation ||
      game.visitor_team?.name ||
      game.visitor_team?.full_name ||
      "AWAY";

    return `${away} @ ${home}`;
  }

  function formatStatus(game) {
    if (game.status && typeof game.status === "string") {
      return game.status;
    }
    return "Scheduled";
  }

  function showState({ loading, error, empty, hasData }) {
    const loadingEl = getEl("games-today-loading");
    const errorEl = getEl("games-today-error");
    const emptyEl = getEl("games-today-empty");
    const wrapperEl = getEl("games-today-wrapper");

    if (!loadingEl || !errorEl || !emptyEl || !wrapperEl) return;

    loadingEl.style.display = loading ? "" : "none";
    errorEl.style.display = error ? "" : "none";
    emptyEl.style.display = empty ? "" : "none";
    wrapperEl.style.display = hasData ? "" : "none";
  }

  function renderGames(games) {
    const tbody = getEl("games-today-body");
    if (!tbody) return;

    if (!games.length) {
      tbody.innerHTML = "";
      showState({ loading: false, error: false, empty: true, hasData: false });
      return;
    }

    const rows = games
      .map((game) => {
        const matchup = formatMatchup(game);
        const tipoff = formatTipoff(game.date || game.tipoff || game.time);
        const status = formatStatus(game);

        return `
          <tr>
            <td>${matchup}</td>
            <td>${tipoff}</td>
            <td>${status}</td>
            <td style="text-align: right;">
              <button type="button" class="games-table-cta">
                View props / stats
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rows;
    showState({ loading: false, error: false, empty: false, hasData: true });
  }

  async function loadGamesToday() {
    // Initial state: loading
    showState({ loading: true, error: false, empty: false, hasData: false });

    try {
      const games = await fetchGamesToday();
      renderGames(games);
    } catch (err) {
      console.error("Error loading games:", err);
      showState({ loading: false, error: true, empty: false, hasData: false });
    }
  }

  // Called from main.js
  window.initGamesToday = function initGamesToday() {
    if (
      !getEl("games-today-loading") ||
      !getEl("games-today-error") ||
      !getEl("games-today-empty") ||
      !getEl("games-today-wrapper") ||
      !getEl("games-today-body")
    ) {
      return;
    }

    loadGamesToday();
  };
})();
