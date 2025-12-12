// scripts/players-ui.js
// Thread 7 – Players view shell + demo player list + click → stats card wiring

(function () {
  // Demo players to prove the flow. Later we replace this with real roster data.
  const DEMO_PLAYERS = [
    { key: "demo-lebron", name: "LeBron James", team: "LAL", position: "F" },
    { key: "demo-davis", name: "Anthony Davis", team: "LAL", position: "C/F" },
    { key: "demo-tatum", name: "Jayson Tatum", team: "BOS", position: "F" },
    { key: "demo-brown", name: "Jaylen Brown", team: "BOS", position: "G/F" },
    { key: "demo-curry", name: "Stephen Curry", team: "GSW", position: "G" },
    { key: "demo-giannis", name: "Giannis Antetokounmpo", team: "MIL", position: "F" },
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

  function updateStatsCardForPlayer(player) {
    const titleEl = document.getElementById("player-card-title");
    const subtitleEl = document.getElementById("player-card-subtitle");
    const statEls = document.querySelectorAll(".player-stat-value");

    if (titleEl) {
      titleEl.textContent = player.name;
    }

    if (subtitleEl) {
      subtitleEl.textContent =
        `Season averages for ${player.name} (${player.team} · ${player.position}) will load here from /api/stats/season in the next step.`;
    }

    // For now we keep placeholders in the grid. Next thread: plug real numbers.
    statEls.forEach((el) => {
      el.textContent = "—";
    });
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

        updateStatsCardForPlayer(player);
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
