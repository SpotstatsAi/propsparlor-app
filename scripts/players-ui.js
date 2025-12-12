// scripts/players-ui.js
// Thread 7 – Players view: game context + demo player list +
// tabbed Season / Last 10 / Last 5 stats card.

(function () {
  const SEASON_API_URL = "/api/stats/season";
  const AVERAGES_API_URL = "/api/stats/averages";

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

  // State and cache
  let currentPlayer = null;
  let currentTab = "season"; // "season" | "last10" | "last5"
  const statsCache = Object.create(null); // key: `${playerId}:${tab}`

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

    ensureTabsInitialized();
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

  // ---------- Tabs + card helpers ----------

  function ensureTabsInitialized() {
    const cardShell = document.querySelector(".player-card-shell");
    if (!cardShell || cardShell.dataset.tabsInitialized === "true") return;

    const statsGrid = cardShell.querySelector(".player-stats-grid");
    if (!statsGrid) return;

    const tabs = document.createElement("div");
    tabs.className = "player-tabs";
    // inline styles so we don't have to touch main.css
    tabs.style.display = "flex";
    tabs.style.gap = "6px";
    tabs.style.marginTop = "4px";
    tabs.style.marginBottom = "4px";

    const config = [
      { id: "season", label: "Season" },
      { id: "last10", label: "Last 10" },
      { id: "last5", label: "Last 5" },
    ];

    config.forEach((tabCfg, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      // reuse pill styling so it matches your aesthetic
      btn.className = "player-pill player-tab";
      btn.dataset.tabId = tabCfg.id;
      btn.textContent = tabCfg.label;

      if (idx === 0) {
        btn.classList.add("player-pill-active");
      }

      btn.addEventListener("click", () => {
        onTabClick(tabCfg.id);
      });

      tabs.appendChild(btn);
    });

    cardShell.insertBefore(tabs, statsGrid);
    cardShell.dataset.tabsInitialized = "true";
  }

  function updateTabActiveClasses() {
    const tabButtons = document.querySelectorAll(".player-tab");
    tabButtons.forEach((btn) => {
      const id = btn.dataset.tabId;
      if (id === currentTab) {
        btn.classList.add("player-pill-active");
      } else {
        btn.classList.remove("player-pill-active");
      }
    });
  }

  function setStatValuesFromObject(statsObj) {
    const statEls = document.querySelectorAll(".player-stat-value");
    statEls.forEach((el) => {
      const key = el.dataset.statKey;
      let raw =
        statsObj && Object.prototype.hasOwnProperty.call(statsObj, key)
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

  function subtitleForTab(tab, player, isLoading) {
    if (!player) {
      return "Select a player from the list above.";
    }

    const base = `${player.name} (${player.team} · ${player.position})`;
    if (isLoading) {
      if (tab === "season") {
        return `Loading season averages for ${base}…`;
      }
      if (tab === "last10") {
        return `Loading last 10 games averages for ${base}…`;
      }
      if (tab === "last5") {
        return `Loading last 5 games averages for ${base}…`;
      }
    } else {
      if (tab === "season") {
        return `Season averages for ${base}.`;
      }
      if (tab === "last10") {
        return `Last 10 games averages for ${base}.`;
      }
      if (tab === "last5") {
        return `Last 5 games averages for ${base}.`;
      }
    }
    return "";
  }

  function applySubtitle(tab, player, isLoading) {
    const subtitleEl = document.getElementById("player-card-subtitle");
    if (!subtitleEl) return;
    subtitleEl.textContent = subtitleForTab(tab, player, isLoading);
  }

  async function fetchStatsForTab(playerId, tab) {
    const cacheKey = `${playerId}:${tab}`;
    if (statsCache[cacheKey]) {
      return statsCache[cacheKey];
    }

    let url;
    if (tab === "season") {
      url = `${SEASON_API_URL}?player_id=${encodeURIComponent(playerId)}`;
    } else if (tab === "last10") {
      url =
        `${AVERAGES_API_URL}?player_id=${encodeURIComponent(playerId)}` +
        `&window=10`;
    } else if (tab === "last5") {
      url =
        `${AVERAGES_API_URL}?player_id=${encodeURIComponent(playerId)}` +
        `&window=5`;
    } else {
      return null;
    }

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload || payload.ok === false) {
      console.error("Stats API error for tab", tab, res.status, payload);
      return null;
    }

    // Be defensive about shapes: { averages }, { data: { averages } }, etc.
    let data =
      payload.averages ||
      payload.data?.averages ||
      payload.data ||
      payload.stats ||
      payload;

    const averages =
      data?.averages || data?.stats || data || {};

    const pts = toNum(averages.pts ?? averages.points);
    const reb = toNum(averages.reb ?? averages.trb ?? averages.rebounds);
    const ast = toNum(averages.ast ?? averages.assists);
    const pra = derivePra(averages);
    const fg3m = toNum(
      averages.fg3m ??
        averages.threes ??
        averages.three_pointers_made ??
        averages["3pm"]
    );

    const finalStats = { pts, reb, ast, pra, fg3m };

    statsCache[cacheKey] = finalStats;
    return finalStats;
  }

  async function renderTabStats(tab) {
    if (!currentPlayer || !currentPlayer.bdlId) {
      setStatValuesFromObject({});
      applySubtitle(tab, currentPlayer, false);
      return;
    }

    applySubtitle(tab, currentPlayer, true);
    // show placeholders while loading
    setStatValuesFromObject({ pts: "—", reb: "—", ast: "—", pra: "—", fg3m: "—" });

    try {
      const stats = await fetchStatsForTab(currentPlayer.bdlId, tab);
      if (!stats) {
        // leave the placeholders but don't show the "unable to load" hard error
        applySubtitle(tab, currentPlayer, false);
        return;
      }
      setStatValuesFromObject(stats);
      applySubtitle(tab, currentPlayer, false);
    } catch (err) {
      console.error("Failed to load stats for tab", tab, err);
      applySubtitle(tab, currentPlayer, false);
      // placeholders stay as "—"
    }
  }

  function onTabClick(tabId) {
    if (!currentPlayer) {
      currentTab = tabId;
      updateTabActiveClasses();
      return;
    }
    currentTab = tabId;
    updateTabActiveClasses();
    renderTabStats(currentTab);
  }

  // ---------- Player list + click wiring ----------

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
        // Mark active pill in the player list
        document
          .querySelectorAll(".player-pill")
          .forEach((el) => {
            if (!el.classList.contains("player-tab")) {
              el.classList.remove("player-pill-active");
            }
          });
        btn.classList.add("player-pill-active");

        // Set current player and load stats for the currently active tab
        currentPlayer = player;
        const titleEl = document.getElementById("player-card-title");
        if (titleEl) {
          titleEl.textContent = player.name;
        }

        ensureTabsInitialized();
        updateTabActiveClasses();
        renderTabStats(currentTab);
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

    ensureTabsInitialized();
    updateTabActiveClasses();
    renderDemoPlayers(gameLabel);
  }

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  // Expose a small namespace on window for other scripts.
  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
