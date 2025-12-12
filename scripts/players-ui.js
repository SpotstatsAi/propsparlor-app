// scripts/players-ui.js
// Thread 7 – Players view shell + helper to open it from the games table.

(function () {
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
        "When you click a player, we'll show their season averages here.";
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

  /**
   * Public helper: open the Players view for a given game label.
   * In the next step, the games table will call this with something like:
   *   PropsParlor.openPlayersForGame("LAL @ BOS · 7:30 PM");
   */
  function openPlayersForGame(gameLabel) {
    switchToPlayersView();

    const gameCtx = document.getElementById("players-game-context");
    if (gameCtx) {
      gameCtx.textContent =
        gameLabel || "Game selected – players for this matchup will load here.";
    }
  }

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  // Expose a small namespace on window for other scripts.
  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
