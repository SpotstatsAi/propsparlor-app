// scripts/players-ui.js
// Thread 7 – Players view: game context + demo player list + live season stats card.

(function () {
  const SEASON_API_URL = "/api/stats/season";

  // Demo players to prove the full flow.
  // bdlId values match BallDontLie player IDs.
  const DEMO_PLAYERS = [
    { key: "demo-lebron",  name: "LeBron James",           team: "LAL", position: "F",   bdlId: 237 },
    { key: "demo-davis",   name: "Anthony Davis",          team: "LAL", position: "C/F", bdlId: 140 },
    { key: "demo-tatum",   name: "Jayson Tatum",           team: "BOS", position: "F",   bdlId: 434 },
    { key: "demo-brown",   name: "Jaylen Brown",           team: "BOS", position: "G/F", bdlId: 286 },
    { key: "demo-curry",   name: "Stephen Curry",          team: "GSW", position: "G",   bdlId: 115 },
    { key: "demo-giannis", name: "Giannis Antetokounmpo",  team: "MIL", position: "F",   bdlId: 15  },
  ];

  function initPlayerViewPlaceholders() {
    const gameCtx = document.getElementById("players-game-context");
    const titleEl = document.getElementById("player-card-title");
    const subtitleEl = document.getElementById("player-card-subtitle");

    if (gameCtx && !gameCtx.dataset.initialized) {
      gameCtx.dataset.initialized = "true";
      gameCtx.textContent = "Select a game from Today's Games to load players.";
    }

    if (titleEl && !titleEl.dataset.initialized) {
      titleEl.dataset.initialized = "true";
      titleEl.textContent = "No player selected";
    }

    if (subtitleEl && !subtitleEl.dataset.initialized) {
      subtitleEl.dataset.initialized = "true";
      subtitleEl.textContent =
        "Select a player from the list above. We'll show their season averages here once the backend is wired.";
    }
  }

  function switchToPlayersView() {
    // Toggle center views
    const views = document.querySelectorAll(".view");
    views.forEach((view) => {
      const panelName = view.getAttribute("data-view-panel");
      view.classList.toggle("view-active", panelName === "players");
    });

    // Update left nav highlighting
    const navButtons = document.querySelectorAll(".nav-item");
    navButtons.forEach((btn) => {
      const target = btn.getAttribute("data-view");
      btn.classList.toggle("nav-item-active", target === "players");
    });
  }

  function setStatValuesFromObject(statsObj) {
    const statEls = document.querySelectorAll(".player-stat-value");
    statEls.forEach((el) => {
      const key = el.dataset.statKey;
      let raw = statsObj && Object.prototype.hasOwnProperty.call(statsObj, key)
        ? statsObj[key]
        : null;

      if (raw === null || raw === undefined || raw === "" || Number.isNaN(raw)) {
        el.textContent = "—";
        return;
      }

      const num = typeof raw === "number" ? raw : parseFloat(raw);
      if (Number.isFinite(num)) {
        el.textContent = num.toFixed(1);
      } else {
        el.textContent = String(raw);
      }
    });
  }

  function toNum(val) {
    if (val === null || val === undefined) return null;
    const n = typeof val === "number" ? val : parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }

  function derivePra(stats) {
    if (!stats) return null;
    if (stats.pra !== undefined && stats.pra !== null) {
      return toNum(stats.pra);
    }
    const pts = toNum(stats.pts ?? stats.points);
    const reb = toNum(stats.reb ?? stats.trb ?? stats.rebounds);
    const ast = toNum(stats.ast ?? stats.assists);
    if (pts === null || reb === null || ast === null) return null;
    return pts + reb + ast;
  }

  async function loadSeasonStatsForPlayer(player) {
    const titleEl = document.getElementById("player-card-title");
    const subtitleEl = document.getElementById("player-card-subtitle");

    if (titleEl) {
      titleEl.textContent = player.name;
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Loading season averages for ${player.name} (${player.team} · ${player.position})…`;
    }

    // Set temporary placeholders while loading
    setStatValuesFromObject({ pts: "—", reb: "—", ast: "—", pra: "—", fg3m: "—" });

    if (!player.bdlId) {
      if (subtitleEl) {
        subtitleEl.textContent =
          `No BallDontLie ID mapped for ${player.name} yet. Stats will be added once mapping is configured.`;
      }
      return;
    }

    try {
      const url = `${SEASON_API_URL}?player_id=${encodeURIComponent(player.bdlId)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });

      if (!res.ok) {
        throw new Error(`Non-200 from /api/stats/season: ${res.status}`);
      }

      const payload = await res.json();
      if (payload && payload.ok === false) {
        throw new Error(
          payload.error && payload.error.message
            ? payload.error.message
            : "API returned error"
        );
      }

      // Try to be defensive about response shape.
      const data = payload && (payload.data || payload.stats || payload.averages || payload);
      const averages =
        (data && (data.averages || data.season || data)) || {};

      const pts = toNum(averages.pts ?? averages.points);
      const reb = toNum(averages.reb ?? averages.trb ?? averages.rebounds);
      const ast = toNum(averages.ast ?? averages.assists);
      const pra = derivePra(averages);
      const fg3m = toNum(averages.fg3m ?? averages.threes ?? averages["3pm"]);

      const finalStats = {
        pts: pts,
        reb: reb,
        ast: ast,
        pra: pra,
        fg3m: fg3m,
      };

      setStatValuesFromObject(finalStats);

      if (subtitleEl) {
        const seasonLabel =
          (data && (data.season_label || data.season)) || "Current Season";
        subtitleEl.textContent =
          `Season averages for ${player.name} (${player.team} · ${player.position}) — ${seasonLabel}.`;
      }
    } catch (err) {
      console.error("Failed to load season stats for player:", err);
      if (subtitleEl) {
        subtitleEl.textContent =
          "Unable to load season stats right now. Please try again in a moment.";
      }
      // Leave placeholders as "—"
    }
  }

  function renderDemoPlayers(gameLabel) {
    const introEl = document.getElementById("players-list-intro");
    const gridEl = document.getElementById("players-list-grid");
    if (!gridEl) return;

    gridEl.innerHTML = "";

    if (introEl) {
      introEl.textContent = gameLabel
        ? `Demo key players for ${gameLabel}. Later this will be driven by real rosters from BDL.`
        : "Demo key players. Later this will be driven by real rosters from BDL.";
    }

    DEMO_PLAYERS.forEach((player) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-pill";
      btn.textContent = `${player.name} · ${player.team}`;

      btn.addEventListener("click", () => {
        // Mark active pill
        document
          .querySelectorAll(".player-pill")
          .forEach((el) => el.classList.remove("player-pill-active"));
        btn.classList.add("player-pill-active");

        // Load stats into the card
        loadSeasonStatsForPlayer(player);
      });

      gridEl.appendChild(btn);
    });
  }

  /**
   * Public helper: open the Players view for a given game label.
   * Called from games-today-ui.js when a user clicks "Players & Stats".
   */
  function openPlayersForGame(gameLabel) {
    switchToPlayersView();

    const gameCtx = document.getElementById("players-game-context");
    if (gameCtx) {
      gameCtx.textContent =
        gameLabel || "Game selected – players for this matchup will load here.";
    }

    renderDemoPlayers(gameLabel);
  }

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  // Expose a small namespace on window for other scripts.
  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
