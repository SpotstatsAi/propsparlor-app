// scripts/players-ui.js
// Thread 7 – Players view: game context + matchup-aware demo player list +
// Season / Last 10 / Last 5 stats + stat “meter tiles” + Add to Slip +
// selectable primary stat (PTS / REB / AST / PRA / 3PM).

(function () {
  const SEASON_API_URL = "/api/stats/season";
  const AVERAGES_API_URL = "/api/stats/averages";

  const DEMO_PLAYERS = [
    { key: "demo-lebron",  name: "LeBron James",          team: "LAL", position: "F",   bdlId: 237 },
    { key: "demo-davis",   name: "Anthony Davis",         team: "LAL", position: "C/F", bdlId: 140 },
    { key: "demo-tatum",   name: "Jayson Tatum",          team: "BOS", position: "F",   bdlId: 434 },
    { key: "demo-brown",   name: "Jaylen Brown",          team: "BOS", position: "G/F", bdlId: 286 },
    { key: "demo-curry",   name: "Stephen Curry",         team: "GSW", position: "G",   bdlId: 115 },
    { key: "demo-giannis", name: "Giannis Antetokounmpo", team: "MIL", position: "F",   bdlId: 15 },
  ];

  let currentPlayer = null;
  let currentTab = "season";  // "season" | "last10" | "last5"
  let primaryStatKey = "pra"; // "pts" | "reb" | "ast" | "pra" | "fg3m"
  const statsCache = Object.create(null); // key: `${playerId}:${tab}`

  function initPlayerViewPlaceholders() {
    const addSlipBtn = document.getElementById("player-add-slip");

    if (addSlipBtn && !addSlipBtn.dataset.bound) {
      addSlipBtn.dataset.bound = "true";
      addSlipBtn.addEventListener("click", () => {
        handleAddToSlipClick();
      });
      addSlipBtn.disabled = true;
      addSlipBtn.textContent = "Add to Slip (Disabled · No Player)";
    }

    ensureTabsInitialized();
    wireStatRows();
    updateStatMeters(null);
  }

  function switchToPlayersView() {
    const views = document.querySelectorAll(".view");
    views.forEach((view) => {
      const panelName = view.getAttribute("data-view-panel");
      view.classList.toggle("view-active", panelName === "players");
    });

    const navButtons = document.querySelectorAll(".nav-item");
    navButtons.forEach((btn) => {
      const target = btn.getAttribute("data-view");
      btn.classList.toggle("nav-item-active", target === "players");
    });
  }

  function ensureTabsInitialized() {
    const cardShell = document.querySelector(".player-card-shell");
    if (!cardShell || cardShell.dataset.tabsInitialized === "true") return;

    const statsGrid = cardShell.querySelector(".player-stats-grid");
    if (!statsGrid) return;

    const tabs = document.createElement("div");
    tabs.className = "player-tabs";
    tabs.style.display = "flex";
    tabs.style.gap = "6px";
    tabs.style.marginTop = "8px";
    tabs.style.marginBottom = "6px";

    const config = [
      { id: "season", label: "Season" },
      { id: "last10", label: "Last 10" },
      { id: "last5", label: "Last 5" },
    ];

    config.forEach((tabCfg, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-pill player-tab";
      btn.dataset.tabId = tabCfg.id;
      btn.textContent = tabCfg.label;

      if (idx === 0) btn.classList.add("player-pill-active");

      btn.addEventListener("click", () => onTabClick(tabCfg.id));
      tabs.appendChild(btn);
    });

    cardShell.insertBefore(tabs, statsGrid);
    cardShell.dataset.tabsInitialized = "true";
  }

  function updateTabActiveClasses() {
    const tabButtons = document.querySelectorAll(".player-tab");
    tabButtons.forEach((btn) => {
      const id = btn.dataset.tabId;
      btn.classList.toggle("player-pill-active", id === currentTab);
    });
  }

  function toNum(val) {
    if (val === null || val === undefined) return null;
    const n = typeof val === "number" ? val : parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }

  function derivePra(stats) {
    if (!stats) return null;
    if (stats.pra !== undefined && stats.pra !== null) return toNum(stats.pra);
    const pts = toNum(stats.pts ?? stats.points);
    const reb = toNum(stats.reb ?? stats.trb ?? stats.rebounds);
    const ast = toNum(stats.ast ?? stats.assists);
    if (pts === null || reb === null || ast === null) return null;
    return pts + reb + ast;
  }

  function setStatValuesFromObject(statsObj) {
    const statEls = document.querySelectorAll(".player-stat-value");
    statEls.forEach((el) => {
      const key = el.dataset.statKey;
      const raw =
        statsObj && Object.prototype.hasOwnProperty.call(statsObj, key)
          ? statsObj[key]
          : null;

      if (raw === null || raw === undefined || raw === "" || Number.isNaN(raw)) {
        el.textContent = "—";
        return;
      }

      const num = typeof raw === "number" ? raw : parseFloat(raw);
      el.textContent = Number.isFinite(num) ? num.toFixed(1) : String(raw);
    });

    updateStatMeters(statsObj || null);
  }

  // NEW: set meter fill % for each stat row based on max stat in current view
  function updateStatMeters(statsObj) {
    const rows = document.querySelectorAll(".player-stat-row");
    if (!rows.length) return;

    if (!statsObj) {
      rows.forEach((row) => row.style.setProperty("--fill", "0%"));
      return;
    }

    const vals = ["pts", "reb", "ast", "pra", "fg3m"]
      .map((k) => toNum(statsObj[k]))
      .filter((v) => v !== null);

    const maxVal = vals.length ? Math.max(...vals) : 0;

    rows.forEach((row) => {
      const valEl = row.querySelector(".player-stat-value");
      const key = valEl ? valEl.dataset.statKey : null;
      const v = key ? toNum(statsObj[key]) : null;

      if (!key || v === null || maxVal <= 0) {
        row.style.setProperty("--fill", "0%");
        return;
      }

      // keep a minimum visible fill so it doesn’t look “dead”
      const pct = Math.max(6, Math.min(100, (v / maxVal) * 100));
      row.style.setProperty("--fill", `${pct}%`);
    });
  }

  function wireStatRows() {
    const rows = document.querySelectorAll(".player-stat-row");
    rows.forEach((row) => {
      row.addEventListener("click", () => {
        const valEl = row.querySelector(".player-stat-value");
        const key = valEl ? valEl.dataset.statKey : null;
        if (!key) return;
        setPrimaryStat(key);
      });
    });

    setPrimaryStat(primaryStatKey);
  }

  function setPrimaryStat(key) {
    if (!key) return;
    primaryStatKey = key;

    const rows = document.querySelectorAll(".player-stat-row");
    rows.forEach((row) => {
      const valEl = row.querySelector(".player-stat-value");
      const rowKey = valEl ? valEl.dataset.statKey : null;
      row.classList.toggle("player-stat-row-active", rowKey === primaryStatKey);
    });

    syncAddSlipButtonDisabled();
  }

  function subtitleForTab(tab, player, isLoading) {
    if (!player) return "Select a player from the list above.";
    const base = `${player.name} (${player.team} · ${player.position})`;

    if (isLoading) {
      if (tab === "season") return `Loading season averages for ${base}…`;
      if (tab === "last10") return `Loading last 10 games averages for ${base}…`;
      if (tab === "last5") return `Loading last 5 games averages for ${base}…`;
    } else {
      if (tab === "season") return `Season averages for ${base}.`;
      if (tab === "last10") return `Last 10 games averages for ${base}.`;
      if (tab === "last5") return `Last 5 games averages for ${base}.`;
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
    if (statsCache[cacheKey]) return statsCache[cacheKey];

    let url;
    if (tab === "season") {
      url = `${SEASON_API_URL}?player_id=${encodeURIComponent(playerId)}`;
    } else if (tab === "last10") {
      url = `${AVERAGES_API_URL}?player_id=${encodeURIComponent(playerId)}&window=10`;
    } else if (tab === "last5") {
      url = `${AVERAGES_API_URL}?player_id=${encodeURIComponent(playerId)}&window=5`;
    } else {
      return null;
    }

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload || payload.ok === false) {
      console.error("Stats API error", tab, res.status, payload);
      return null;
    }

    const data =
      payload.averages ||
      payload.data?.averages ||
      payload.data ||
      payload.stats ||
      payload;

    const averages = data?.averages || data?.stats || data || {};

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
      syncAddSlipButtonDisabled();
      return;
    }

    applySubtitle(tab, currentPlayer, true);

    setStatValuesFromObject({ pts: "—", reb: "—", ast: "—", pra: "—", fg3m: "—" });
    syncAddSlipButtonDisabled();

    try {
      const stats = await fetchStatsForTab(currentPlayer.bdlId, tab);
      if (!stats) {
        applySubtitle(tab, currentPlayer, false);
        updateStatMeters(null);
        syncAddSlipButtonDisabled();
        return;
      }

      setStatValuesFromObject(stats);
      applySubtitle(tab, currentPlayer, false);
      syncAddSlipButtonDisabled();
    } catch (err) {
      console.error("Failed to load stats", tab, err);
      applySubtitle(tab, currentPlayer, false);
      updateStatMeters(null);
      syncAddSlipButtonDisabled();
    }
  }

  function onTabClick(tabId) {
    currentTab = tabId;
    updateTabActiveClasses();
    if (!currentPlayer) return;
    renderTabStats(currentTab);
  }

  function extractTeamsFromLabel(label) {
    if (!label) return null;
    const cleaned = label.replace(/\s+/g, " ").trim();
    let parts;

    if (cleaned.includes("@")) parts = cleaned.split("@");
    else if (/vs\.?/i.test(cleaned)) parts = cleaned.split(/vs\.?/i);
    else if (/\sat\s/i.test(cleaned)) parts = cleaned.split(/\sat\s/i);
    else return null;

    if (!parts || parts.length !== 2) return null;

    const away = parts[0].trim().slice(0, 3).toUpperCase();
    const home = parts[1].trim().slice(0, 3).toUpperCase();
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
      if (filtered.length > 0) playersForMatchup = filtered;
    }

    if (introEl) {
      introEl.textContent =
        teams
          ? `Demo key players for ${teams.away} and ${teams.home} in ${gameLabel}. Later this will be driven by real rosters from BDL.`
          : `Demo key players for ${gameLabel || "this matchup"}. Later this will be driven by real rosters from BDL.`;
    }

    playersForMatchup.forEach((player) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "player-pill";
      btn.textContent = `${player.name} · ${player.team}`;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".player-pill").forEach((el) => {
          if (!el.classList.contains("player-tab")) el.classList.remove("player-pill-active");
        });
        btn.classList.add("player-pill-active");

        currentPlayer = player;

        const titleEl = document.getElementById("player-card-title");
        if (titleEl) titleEl.textContent = player.name;

        ensureTabsInitialized();
        wireStatRows();
        updateTabActiveClasses();
        renderTabStats(currentTab);
      });

      gridEl.appendChild(btn);
    });
  }

  function currentTabLabelShort() {
    if (currentTab === "last10") return "L10";
    if (currentTab === "last5") return "L5";
    return "SEASON";
  }

  function statLabelFromKey(key) {
    switch (key) {
      case "pts": return "PTS";
      case "reb": return "REB";
      case "ast": return "AST";
      case "fg3m": return "3PM";
      case "pra":
      default: return "PRA";
    }
  }

  function readStatsFromDom() {
    const values = {};
    document.querySelectorAll(".player-stat-value").forEach((el) => {
      const key = el.dataset.statKey;
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

    const stats = readStatsFromDom();
    const hasAnyNumeric =
      stats.pts !== null ||
      stats.reb !== null ||
      stats.ast !== null ||
      stats.pra !== null ||
      stats.fg3m !== null;

    if (!hasAnyNumeric) {
      btn.disabled = true;
      btn.textContent = "Add to Slip (Disabled · No Stats)";
      return;
    }

    btn.disabled = false;
    btn.textContent = "Add to Slip";
  }

  function handleAddToSlipClick() {
    if (!currentPlayer) return;

    const btn = document.getElementById("player-add-slip");
    if (btn && btn.disabled) return;

    const stats = readStatsFromDom();
    const slipList = document.querySelector(".slip-list");
    if (!slipList) return;

    const placeholder = slipList.querySelector(".slip-placeholder-row");
    if (placeholder) placeholder.remove();

    const tabLabel = currentTabLabelShort();

    const statKeysInOrder = [primaryStatKey, "pra", "pts", "reb", "ast", "fg3m"]
      .filter((v, i, arr) => v && arr.indexOf(v) === i);

    let chosenKey = null;
    let chosenValue = null;
    for (const key of statKeysInOrder) {
      if (stats[key] !== null && stats[key] !== undefined) {
        chosenKey = key;
        chosenValue = stats[key];
        break;
      }
    }
    if (!chosenKey) return;

    const label = statLabelFromKey(chosenKey);
    const title = `${currentPlayer.name} · ${tabLabel} ${label}`;
    const tagText = `${currentPlayer.team} · ${tabLabel}`;

    const li = document.createElement("li");
    li.className = "slip-row";

    const header = document.createElement("div");
    header.className = "slip-row-header";

    const titleEl = document.createElement("span");
    titleEl.className = "slip-row-title";
    titleEl.textContent = `${title} ${chosenValue.toFixed(1)}`;

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
        stats.pra !== null ? `PRA ${stats.pra.toFixed(1)}` : null,
        stats.fg3m !== null ? `3PM ${stats.fg3m.toFixed(1)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "No numeric stats available";

    li.appendChild(header);
    li.appendChild(sub);
    slipList.appendChild(li);
  }

  function openPlayersForGame(gameLabel) {
    switchToPlayersView();

    const gameCtx = document.getElementById("players-game-context");
    if (gameCtx) gameCtx.textContent = gameLabel || "Game selected.";

    currentPlayer = null;

    const titleEl = document.getElementById("player-card-title");
    if (titleEl) titleEl.textContent = "No player selected";

    applySubtitle(currentTab, currentPlayer, false);
    setStatValuesFromObject({});
    primaryStatKey = "pra";
    setPrimaryStat(primaryStatKey);
    syncAddSlipButtonDisabled();

    ensureTabsInitialized();
    wireStatRows();
    updateTabActiveClasses();
    renderDemoPlayers(gameLabel);
  }

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
