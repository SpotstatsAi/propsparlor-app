// scripts/players-ui.js
// Thread 7 – Players view: game context + matchup-aware demo player list +
// Season / Last 10 / Last 5 stats + stat “meter tiles” + Add to Slip +
// selectable primary stat (PTS / REB / AST / PRA / 3PM).
//
// Chart upgrade: pulls /api/stats/gamelog and renders SVG sparklines + a main line chart.
// Scroll upgrade (NEXT): single shared horizontal scroll rail (sparks + main chart together).
// Result: no scroll-sync jitter/freeze because there is only one scrollbar.

(function () {
  const SEASON_API_URL = "/api/stats/season";
  const AVERAGES_API_URL = "/api/stats/averages";
  const GAMELOG_API_URL = "/api/stats/gamelog";

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
  const statsCache = Object.create(null);    // key: `${playerId}:${tab}`
  const gamelogCache = Object.create(null);  // key: `${playerId}` -> array

  function initPlayerViewPlaceholders() {
    const addSlipBtn = document.getElementById("player-add-slip");

    if (addSlipBtn && !addSlipBtn.dataset.bound) {
      addSlipBtn.dataset.bound = "true";
      addSlipBtn.addEventListener("click", () => handleAddToSlipClick());
      addSlipBtn.disabled = true;
      addSlipBtn.textContent = "Add to Slip (Disabled · No Player)";
    }

    ensureTabsInitialized();
    wireStatRows();
    updateStatMeters(null);

    // Build the shared chart rail once and keep it stable.
    ensureChartRail();

    renderChartPlaceholders();
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

      const pct = Math.max(6, Math.min(100, (v / maxVal) * 100));
      row.style.setProperty("--fill", `${pct}%`);
    });
  }

  function wireStatRows() {
    const rows = document.querySelectorAll(".player-stat-row");
    rows.forEach((row) => {
      if (row.dataset.bound === "true") return;
      row.dataset.bound = "true";
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

    if (currentPlayer && currentPlayer.bdlId) {
      renderChartsForCurrentPlayer().catch(() => {});
    }
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

  async function fetchGamelog(playerId, limit) {
    if (gamelogCache[String(playerId)]) return gamelogCache[String(playerId)];

    const url = `${GAMELOG_API_URL}?player_id=${encodeURIComponent(playerId)}&limit=${encodeURIComponent(limit)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload || payload.ok === false) {
      console.error("Gamelog API error", res.status, payload);
      return null;
    }

    const rows = Array.isArray(payload.gamelog) ? payload.gamelog : [];
    gamelogCache[String(playerId)] = rows;
    return rows;
  }

  async function renderTabStats(tab) {
    if (!currentPlayer || !currentPlayer.bdlId) {
      setStatValuesFromObject({});
      applySubtitle(tab, currentPlayer, false);
      syncAddSlipButtonDisabled();
      renderChartPlaceholders();
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
        renderChartPlaceholders();
        return;
      }

      setStatValuesFromObject(stats);
      applySubtitle(tab, currentPlayer, false);
      syncAddSlipButtonDisabled();

      await renderChartsForCurrentPlayer();
    } catch (err) {
      console.error("Failed to load stats", tab, err);
      applySubtitle(tab, currentPlayer, false);
      updateStatMeters(null);
      syncAddSlipButtonDisabled();
      renderChartPlaceholders();
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

      btn.addEventListener("click", async () => {
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

        renderChartLoadingState();
        await renderTabStats(currentTab);
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

    ensureChartRail();
    renderChartPlaceholders();
    renderDemoPlayers(gameLabel);
  }

  // ---------------------------
  // Charts (SVG, lightweight)
  // ---------------------------

  function getChartNodes() {
    const sparklines = document.getElementById("player-sparklines");
    const main = document.getElementById("player-main-chart");
    return { sparklines, main };
  }

  // Build a single shared scroll rail by wrapping the two existing containers.
  function ensureChartRail() {
    const { sparklines, main } = getChartNodes();
    if (!sparklines || !main) return;

    // Already upgraded
    if (main.dataset.railReady === "true") return;

    // Find a common parent to wrap (the chart panel content area).
    const parent = sparklines.parentElement;
    if (!parent || parent !== main.parentElement) {
      // If markup changes later, fail safely without breaking the page.
      main.dataset.railReady = "true";
      return;
    }

    // Build rail DOM
    const rail = document.createElement("div");
    rail.className = "chart-rail";
    rail.id = "player-chart-rail";

    const inner = document.createElement("div");
    inner.className = "chart-rail-inner";

    // Convert existing nodes into the new roles
    sparklines.classList.add("sparks-strip");
    main.classList.add("main-chart-viewport");

    // Remove legacy inline styles that can fight layout
    sparklines.removeAttribute("style");
    main.removeAttribute("style");

    // Move them under the rail (keeps IDs intact for JS)
    parent.insertBefore(rail, sparklines);
    rail.appendChild(inner);
    inner.appendChild(sparklines);
    inner.appendChild(main);

    // Initialize spark row with the new “spark-card” structure
    renderSparkScaffold();

    main.dataset.railReady = "true";
  }

  function renderSparkScaffold() {
    const sparklines = document.getElementById("player-sparklines");
    if (!sparklines) return;

    const keys = [
      { key: "pts", label: "PTS Spark" },
      { key: "reb", label: "REB Spark" },
      { key: "ast", label: "AST Spark" },
      { key: "pra", label: "PRA Spark" },
      { key: "fg3m", label: "3PM Spark" },
    ];

    sparklines.innerHTML = "";

    keys.forEach((k) => {
      const card = document.createElement("div");
      card.className = "spark-card";
      card.dataset.sparkKey = k.key;

      const label = document.createElement("span");
      label.className = "status-label";
      label.textContent = k.label;

      const host = document.createElement("div");
      host.className = "spark-host";
      host.dataset.sparkHost = k.key;

      card.appendChild(label);
      card.appendChild(host);
      sparklines.appendChild(card);
    });
  }

  function renderChartPlaceholders() {
    ensureChartRail();

    const main = document.getElementById("player-main-chart");
    if (!main) return;

    // If we haven't built scaffold yet, do it now.
    const sparklines = document.getElementById("player-sparklines");
    if (sparklines && (!sparklines.children || sparklines.children.length === 0)) {
      renderSparkScaffold();
    }

    main.innerHTML =
      `<div class="main-chart-placeholder">
        <div class="main-chart-title">Main Trend Chart</div>
        <div class="main-chart-copy">
          Select a player to render sparklines + a trend chart inside one shared scroll rail.
        </div>
      </div>`;
  }

  function renderChartLoadingState() {
    ensureChartRail();

    const main = document.getElementById("player-main-chart");
    if (!main) return;

    main.innerHTML =
      `<div class="main-chart-placeholder">
        <div class="main-chart-title">Loading chart…</div>
        <div class="main-chart-copy">Pulling game logs for the selected player.</div>
      </div>`;
  }

  function windowSizeForTab(tab) {
    if (tab === "last5") return 5;
    if (tab === "last10") return 10;
    return 25;
  }

  function seriesForKey(rows, key) {
    const ordered = rows.slice().reverse();
    return ordered
      .map((r) => {
        const pts = toNum(r?.pts);
        const reb = toNum(r?.reb);
        const ast = toNum(r?.ast);
        const fg3m = toNum(r?.fg3m);
        const pra = (pts !== null && reb !== null && ast !== null) ? (pts + reb + ast) : null;

        switch (key) {
          case "pts": return pts;
          case "reb": return reb;
          case "ast": return ast;
          case "fg3m": return fg3m;
          case "pra":
          default: return pra;
        }
      })
      .filter((v) => v !== null);
  }

  function buildSparkSVG(values, opts) {
    const width = opts?.width || 160;
    const height = opts?.height || 34;

    if (!values || values.length < 2) {
      return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" aria-label="sparkline">
        <path d="" fill="none" stroke="rgba(0,255,180,0.0)" />
      </svg>`;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);

    const padX = 3;
    const padY = 4;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const pts = values.map((v, i) => {
      const x = padX + (i / (values.length - 1)) * innerW;
      const y = padY + (1 - (v - min) / span) * innerH;
      return [x, y];
    });

    const d = pts
      .map((p, i) =>
        i === 0
          ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
          : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
      )
      .join(" ");

    return `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" aria-label="sparkline">
        <path d="${d}" fill="none" stroke="rgba(0,255,180,0.85)" stroke-width="2" stroke-linecap="round" />
      </svg>
    `;
  }

  function buildMainChartSVG(values, opts) {
    const width = opts?.width || 760;
    const height = opts?.height || 210;

    if (!values || values.length < 2) {
      return `<div class="panel-text" style="opacity:.8;">Not enough game-log points to chart.</div>`;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);

    const padL = 34;
    const padR = 12;
    const padT = 12;
    const padB = 24;

    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const pts = values.map((v, i) => {
      const x = padL + (i / (values.length - 1)) * innerW;
      const y = padT + (1 - (v - min) / span) * innerH;
      return [x, y, v];
    });

    const d = pts
      .map((p, i) =>
        i === 0
          ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
          : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
      )
      .join(" ");

    const roll = rollingAverage(values, Math.min(5, values.length));
    const rollPts = roll.map((v, i) => {
      const x = padL + (i / (roll.length - 1)) * innerW;
      const y = padT + (1 - (v - min) / span) * innerH;
      return [x, y];
    });
    const rd = rollPts
      .map((p, i) =>
        i === 0
          ? `M ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
          : `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
      )
      .join(" ");

    const gridLines = 4;
    const grid = Array.from({ length: gridLines + 1 })
      .map((_, i) => {
        const y = padT + (i / gridLines) * innerH;
        return `<line x1="${padL}" y1="${y.toFixed(2)}" x2="${(padL + innerW).toFixed(
          2
        )}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />`;
      })
      .join("");

    const maxLabel = max.toFixed(0);
    const minLabel = min.toFixed(0);

    const dots = pts
      .map((p) => `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="2.8" fill="rgba(0,255,180,0.85)" />`)
      .join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-label="trend chart">
        ${grid}
        <text x="8" y="${(padT + 10).toFixed(2)}" fill="rgba(255,255,255,0.70)" font-size="10">${maxLabel}</text>
        <text x="8" y="${(padT + innerH).toFixed(2)}" fill="rgba(255,255,255,0.55)" font-size="10">${minLabel}</text>

        <path d="${d}" fill="none" stroke="rgba(0,255,180,0.92)" stroke-width="2.6" stroke-linecap="round" />
        ${dots}

        <path d="${rd}" fill="none" stroke="rgba(0,120,255,0.70)" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 4" />

        <text x="${padL}" y="${height - 8}" fill="rgba(255,255,255,0.55)" font-size="10">Oldest → Newest</text>
      </svg>
    `;
  }

  function rollingAverage(values, window) {
    if (!values || values.length === 0) return [];
    const w = Math.max(1, window | 0);
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - (w - 1));
      const slice = values.slice(start, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      out.push(avg);
    }
    return out;
  }

  function sparkHostForKey(key) {
    const root = document.getElementById("player-sparklines");
    if (!root) return null;
    return root.querySelector(`[data-spark-host="${key}"]`);
  }

  async function renderChartsForCurrentPlayer() {
    ensureChartRail();

    const main = document.getElementById("player-main-chart");
    if (!currentPlayer || !currentPlayer.bdlId || !main) {
      renderChartPlaceholders();
      return;
    }

    const limit = 50;
    const rows = await fetchGamelog(currentPlayer.bdlId, limit);
    if (!rows || rows.length < 2) {
      main.innerHTML = `<div class="panel-text" style="opacity:.8;">No game log available yet.</div>`;
      return;
    }

    const windowN = windowSizeForTab(currentTab);
    const sliced = rows.slice(0, Math.max(windowN, 5));
    const sparkRows = rows.slice(0, 12);

    // Sparklines
    const sparkKeys = ["pts", "reb", "ast", "pra", "fg3m"];
    sparkKeys.forEach((k) => {
      const host = sparkHostForKey(k);
      if (!host) return;
      const vals = seriesForKey(sparkRows, k);
      host.innerHTML = buildSparkSVG(vals, { height: 34, width: 160 });
    });

    // Main chart (make it wide so the single rail actually scrolls)
    const mainVals = seriesForKey(sliced, primaryStatKey);
    const statLabel = statLabelFromKey(primaryStatKey);
    const tabLabel = currentTabLabelShort();

    const pointsW = 28 * Math.max(10, mainVals.length);
    const svgW = Math.max(760, pointsW);

    main.innerHTML = `
      <div style="width:${svgW}px; min-width:${svgW}px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:8px;">
          <div style="font-size:.82rem; letter-spacing:.12em; text-transform:uppercase; opacity:.88;">
            ${statLabel} · ${tabLabel} Trend
          </div>
          <div style="font-size:.72rem; opacity:.72; white-space:nowrap;">
            Rolling avg overlay (v1)
          </div>
        </div>

        ${buildMainChartSVG(mainVals, { width: svgW, height: 210 })}

        <div style="margin-top:8px; font-size:.72rem; opacity:.72; line-height:1.35;">
          Next upgrade: prop-line overlay + hit-rate shading + opponent context.
        </div>
      </div>
    `;
  }

  // ---------------------------
  // Boot
  // ---------------------------
  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
