// scripts/players-ui.js
// Thread 7 – Players view: game context + matchup-aware demo player list +
// Season / Last 10 / Last 5 stats + stat “meter tiles” + Add to Slip +
// selectable primary stat (PTS / REB / AST / PRA / 3PM).
//
// Chart upgrade: pulls /api/stats/gamelog and renders SVG sparklines + a main line chart.
// Scroll upgrade (polished): single horizontal scrollbar (main chart only).
// Hovering the spark row and horizontal-scrolling will move the main chart (no jitter/freeze).

(function () {
  const SEASON_API_URL = "/api/stats/season";
  const AVERAGES_API_URL = "/api/stats/averages";
  const GAMELOG_API_URL = "/api/stats/gamelog";

  const ROSTER_API_URL = "/api/players/roster";

  const DEMO_PLAYERS = [
    { key: "demo-lebron",  name: "LeBron James",          team: "LAL", position: "F",   bdlId: 237 },
    { key: "demo-davis",   name: "Anthony Davis",         team: "LAL", position: "C/F", bdlId: 140 },
    { key: "demo-tatum",   name: "Jayson Tatum",          team: "BOS", position: "F",   bdlId: 434 },
    { key: "demo-brown",   name: "Jaylen Brown",          team: "BOS", position: "G/F", bdlId: 286 },
    { key: "demo-curry",   name: "Stephen Curry",         team: "GSW", position: "G",   bdlId: 115 },
    { key: "demo-giannis", name: "Giannis Antetokounmpo", team: "MIL", position: "F",   bdlId: 15 },
  ];

  let currentPlayer = null;
  let currentTab = "season";
  let primaryStatKey = "pra";

  const statsCache = Object.create(null);
  const gamelogCache = Object.create(null);
  const rosterCache = Object.create(null);

  /* ---------- helpers / setup (unchanged) ---------- */
  // [UNCHANGED CODE ABOVE — identical to what you pasted]
  // …
  // (All functions remain exactly the same up to handleAddToSlipClick)

  function handleAddToSlipClick() {
    if (!currentPlayer) return;

    const btn = document.getElementById("player-add-slip");
    if (btn && btn.disabled) return;

    const stats = readStatsFromDom();
    const tabLabel = currentTabLabelShort();

    const statKeysInOrder = [primaryStatKey, "pra", "pts", "reb", "ast", "fg3m"]
      .filter((v, i, arr) => v && arr.indexOf(v) === i);

    let chosenKey = null;
    let chosenValue = null;

    for (const key of statKeysInOrder) {
      const domVal = stats[key];
      if (Number.isFinite(domVal)) {
        chosenKey = key;
        chosenValue = domVal;
        break;
      }

      const glVal = getLineFromGamelogForKey(key);
      if (Number.isFinite(glVal)) {
        chosenKey = key;
        chosenValue = glVal;
        break;
      }
    }

    if (!chosenKey || !Number.isFinite(chosenValue)) return;

    const statLabel = statLabelFromKey(chosenKey);

    const pick = {
      player_id: currentPlayer.bdlId,
      player_name: currentPlayer.name,
      team: currentPlayer.team,
      stat_key: chosenKey,
      stat_label: statLabel,
      tab: tabLabel,
      line: chosenValue,
      side: "OVER",
    };

    // 🔒 THREAD 8 DEFENSIVE GUARD (ONLY ADDITION)
    if (
      !pick.player_id ||
      !pick.player_name ||
      !pick.stat_key ||
      !Number.isFinite(pick.line)
    ) {
      console.error("Invalid pick payload:", pick);
      return;
    }

    if (window.PropsParlor && window.PropsParlor.Slip && typeof window.PropsParlor.Slip.addPick === "function") {
      window.PropsParlor.Slip.addPick(pick);
      return;
    }

    console.error("Slip store not available. Ensure scripts/slip.js is loaded before players-ui.js.");
  }

  /* ---------- rest of file unchanged ---------- */

  document.addEventListener("DOMContentLoaded", initPlayerViewPlaceholders);

  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.openPlayersForGame = openPlayersForGame;
})();
