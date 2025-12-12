// scripts/players-ui.js
// Thread 7 – Players view: game context + matchup-aware demo player list +
// tabbed Season / Last 10 / Last 5 stats card + mini chart + Add to Slip.

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

  // ---------------------------------------------------------------------------
  // Basic view wiring
  // ---------------------------------------------------------------------------

  function initPlayerViewPlaceholders() {
    const gameCtx = document.getElementById("players-game-context");
    const titleEl = document.getElementById("player-card-title");
    const subtitleEl = document.getElementById("player-card-subtitle");
    const addSlipBtn = document.getElementById("player-add-slip");

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
        "Select a player from the list above. We'll show their stats here for Season, Last 10, and Last 5 once the backend is wired.";
    }

    if (addSlipBtn && !addSlipBtn.dataset.bound) {
      addSlipBtn.dataset.bound = "true";
      addSlipBtn.addEventListener("click", () => {
        handleAddToSlipClick();
      });
      addSlipBtn.disabled = true;
      addSlipBtn.textContent = "Add to Slip (Disabled · No Player)";
    }

    ensureTabsInitialized();
    updateChart(null);
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

  // ---------------------------------------------------------------------------
  // Tabs + card helpers
  // ---------------------------------------------------------------------------

  function ensureTabsInitialized() {
    const cardShell = document.querySelector(".player-card-shell");
    if (!cardShell || cardShell.dataset.tabsInitialized === "true") return;

    const statsGrid = cardShell.querySelector(".player-stats-grid");
    if (!statsGrid) return;

    const tabs = document.createElement("div");
    tabs.className = "player-tabs";
    // inline layout so we don't need extra CSS changes
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

  // ---------------------------------------------------------------------------
  // Mini chart
  // ---------------------------------------------------------------------------

  function updateChart(statsObj) {
    const bodyEl = document.getElementById("player-chart-body");
    if (!bodyEl) return;

    bodyEl.innerHTML = "";

    const order = [
      { key: "pts", label: "PTS" },
      { key: "reb", label: "REB" },
      { key: "ast", label: "AST" },
      { key: "pra", label: "PRA" },
      { key: "fg3m", label: "3PM" },
    ];

    if (!statsObj) {
      const placeholder = document.createElement("div");
      placeholder.textContent =
        "Chart will appear here once stats are available for this tab.";
      placeholder.style.fontSize = "0.75rem";
      placeholder.style.opacity = "0.8";
      bodyEl.appendChild(placeholder);
      return;
    }

    // Collect numeric values and find max
    const values = order.map((entry) => {
      const raw = statsObj[entry.key];
      const num = toNum(raw);
      return num;
    });

    const numericValues = values.filter((v) => v !== null);
    if (numericValues.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.textContent = "No numeric stats available for this tab.";
      placeholder.style.fontSize = "0.75rem";
      placeholder.style.opacity = "0.8";
      bodyEl.appendChild(placeholder);
      return;
    }

    const maxVal = Math.max(...numericValues);

    order.forEach((entry, idx) => {
      const value = values[idx];
      const rowEl = document.createElement("div");
      rowEl.className = "player-chart-row";

      const labelEl = document.createElement("span");
      labelEl.className = "player-chart-label";
      labelEl.textContent = entry.label;

      const trackEl = document.createElement("div");
      trackEl.className = "player-chart-bar-track";

      const fillEl = document.createElement("div");
      fillEl.className = "player-chart-bar-fill";

      if (value === null || maxVal === 0) {
        fillEl.style.transform = "scaleX(0)";
      } else {
        const ratio = Math.max(0.05, Math.min(1, value / maxVal));
        fillEl.style.transform = `scaleX(${ratio})`;
      }

      trackEl.appendChild(fillEl);

      const valEl = document.createElement("span");
      valEl.className = "player-chart-value";
      valEl.textContent = value === null ? "—" : value.toFixed(1);

      rowEl.appendChild(labelEl);
      rowEl.appendChild(trackEl);
      rowEl.appendChild(valEl);

      bodyEl.appendChild(rowEl);
    });
  }

  // ---------------------------------------------------------------------------
  // Tab text helpers
  // ---------------------------------------------------------------------------

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
      updateChart(null);
      applySubtitle(tab, currentPlayer, false);
      syncAddSlipButtonDisabled();
      return;
    }

    applySubtitle(tab, currentPlayer, true);
    // show placeholders while loading
    const placeholderStats = { pts: "—", reb: "—", ast: "—", pra: "—", fg3m: "—" };
    setStatValuesFromObject(placeholderStats);
    updateChart(null);
    syncAddSlipButtonDisabled();

    try {
      const stats = await fetchStatsForTab(currentPlayer.bdlId, tab);
      if (!stats) {
        applySubtitle(tab, currentPlayer, false);
        updateChart(null);
        syncAddSlipButtonDisabled();
        return;
      }
      setStatValuesFromObject(stats);
      updateChart(stats);
      applySubtitle(tab, currentPlayer, false);
      syncAddSlipButtonDisabled();
    } catch (err) {
      console.error("Failed to load stats for tab", tab, err);
      applySubtitle(tab, currentPlayer, false);
      updateChart(null);
      syncAddSlipButtonDisabled();
      // placeholders stay as "—"
    }
  }

  function onTabClick(tabId) {
    currentTab = tabId;
    updateTabActiveClasses();

    if (!currentPlayer) {
      updateChart(null);
      syncAddSlipButtonDisabled();
      return;
    }

    renderTabStats(currentTab);
  }

  // ---------------------------------------------------------------------------
  // Matchup parsing + player list wiring
  // ---------------------------------------------------------------------------

  function extractTeamsFromLabel(label) {
    if (!label) return null;
    // Normalize whitespace
    const cleaned = label.replace(/\s+/g, " ").trim();
    let parts;

    if (cleaned.includes("@")) {
      parts = cleaned.split("@");
    } else if (/vs\.?/i.test(cleaned)) {
      parts = cleaned.split(/vs\.?/i);
    } else if (/\sat\s/i.test(cleaned)) {
      parts = cleaned.split(/\sat\s/i);
    } else {
      return null;
    }

    if (!parts || parts.length !== 2) return null;

    const left = parts[0].trim();
    const right = parts[1].trim();

    // Take first 3 characters as team code, uppercase
    const away = left.slice(0, 3).toUpperCase();
    const home = right.slice(0, 3).toUpperCase();

    return { away, home };
  }

  function renderDemoPlayers(gameLabel) {
    const introEl = document.getElementById("players-list-intro");
    const gridEl = document.getElementById("players-list-grid");
    if (!gridEl) return;

    gridEl.innerHTML = "";

    const teams = extractTeamsFromLabel(gameLabel);
    let playersForMatchup = DEMO_PLAYERS;

    if (teams) {
      const filtered = DEMO_PLAYERS.filter(
        (p) => p.team === teams.away || p.team === teams.home
      );
      if (filtered.length > 0) {
        playersForMatchup = filtered;
      }
    }

    if (introEl) {
      if (teams) {
        introEl.textContent = `Demo key players for ${
          teams.away
        } and ${teams.home} in ${gameLabel}. Later this will be driven by real rosters from BDL.`;
      } else if (gameLabel) {
        introEl.textContent = `Demo key players for ${gameLabel}. Later this will be driven by real rosters from BDL.`;
      } else {
        introEl.textContent =
          "Demo key players. Later this will be driven by real rosters from BDL.";
      }
    }

    playersForMatchup.forEach((player) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-pill";
      btn.textContent = `${player.name} · ${player.team}`;

      btn.addEventListener("click", () => {
        // Mark active pill in the player list (but not the tab pills)
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

  // ---------------------------------------------------------------------------
  // Pick Slip wiring
  // ---------------------------------------------------------------------------

  function currentTabLabelShort() {
    if (currentTab === "last10") return "L10";
    if (currentTab === "last5") return "L5";
    return "SEASON";
  }

  function readStatsFromDom() {
    const values = {};
    document.querySelectorAll(".player-stat-value").forEach((el) => {
      const key = el.dataset.statKey;
      if (!key) return;
      const text = (el.textContent || "").trim();
      const num = parseFloat(text);
      values[key] = Number.isFinite(num) ? num : null;
    });
    return values;
  }

  function syncAddSlipButtonDisabled() {
    const btn = document.getElementById("player-add-slip");
    if (!btn) return;

    if (!currentPlayer) {
      btn.disabled = true;
      btn.textContent = "Add to Slip (Disabled · No Player)";
      return;
    }

    // If we have at least one numeric stat, enable
    const stats = readStatsFromDom();
    const hasNumeric =
      stats.pts !== null ||
      stats.reb !== null ||
      stats.ast !== null ||
      stats.pra !== null ||
      stats.fg3m !== null;

    if (hasNumeric) {
      btn.disabled = false;
      btn.textContent = "Add to Slip";
    } else {
      btn.disabled = true;
      btn.textContent = "Add to Slip (Disabled · No Stats)";
    }
  }

  function handleAddToSlipClick() {
    if (!currentPlayer) return;

    const btn = document.getElementById("player-add-slip");
    if (btn && btn.disabled) return;

    const stats = readStatsFromDom();
    const slipList = document.querySelector(".slip-list");
    if (!slipList) return;

    // Remove placeholder row if present
    const placeholder = slipList.querySelector(".slip-placeholder-row");
    if (placeholder) {
      placeholder.remove();
    }

    const tabLabel = currentTabLabelShort();
    const priValue =
      stats.pra ??
      stats.pts ??
      stats.reb ??
      stats.ast ??
      stats.fg3m ??
      null;

    const title = `${currentPlayer.name} · ${tabLabel} PRA`;
    const tagText = `${currentPlayer.team} · ${tabLabel}`;

    const li = document.createElement("li");
    li.className = "slip-row";

    const header = document.createElement("div");
    header.className = "slip-row-header";

    const titleEl = document.createElement("span");
    titleEl.className = "slip-row-title";
    titleEl.textContent =
      priValue !== null ? `${title} ${priValue.toFixed(1)}` : title;

    const tagEl = document.createElement("span");
    tagEl.className = "slip-row-tag";
    tagEl.textContent = tagText;

    header.appendChild(titleEl);
    header.appendChild(tagEl);

    const sub = document.createElement("div");
    sub.className = "slip-row-sub";
    sub.textContent =
      [
        stats.pts !== null ? `PTS ${stats.pts.toFixed(1)}` : null,
        stats.reb !== null ? `REB ${stats.reb.toFixed(1)}` : null,
        stats.ast !== null ? `AST ${stats.ast.toFixed(1)}` : null,
        stats.fg3m !== null ? `3PM ${stats.fg3m.toFixed(1)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No numeric stats available";

    li.appendChild(header);
    li.appendChild(sub);
    slipList.appendChild(li);
  }

  // ---------------------------------------------------------------------------
  // Public entry: openPlayersForGame
  // ---------------------------------------------------------------------------

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

    // Reset current player when switching games
    currentPlayer = null;
    const titleEl = document.getElementById("player-card-title");
    if (titleEl) {
      titleEl.textContent = "No player selected";
    }
    applySubtitle(currentTab, currentPlayer, false);
    setStatValuesFromObject({});
    updateChart(null);
    syncAddSlipButtonDisabled();

    ensureTabsInitialized();
    updateTabActiveClasses();
    renderDemoPlayers(gameLabel);
  }

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  // Expose a small namespace on window for other scripts.
  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
