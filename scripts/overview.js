// /scripts/overview.js
// Overview → "Today’s Games" wiring.
// Calls /api/stats/games-today and renders a dark, clean table.

function formatDateLabel(date) {
  const options = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  return date.toLocaleDateString(undefined, options);
}

function normalizeGamesPayload(json) {
  // Prefer { ok: true, data: [...] }
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.games)) return json.games;
  return [];
}

async function loadTodaysGames() {
  const loadingEl = document.getElementById("todays-games-loading");
  const errorEl = document.getElementById("todays-games-error");
  const emptyEl = document.getElementById("todays-games-empty");
  const wrapperEl = document.getElementById("todays-games-wrapper");
  const tbodyEl = document.getElementById("todays-games-body");
  const countEl = document.getElementById("todays-games-count");
  const dateLabelEl = document.getElementById("overview-date-label");

  // If the panel isn't on this page, do nothing.
  if (
    !loadingEl ||
    !errorEl ||
    !emptyEl ||
    !wrapperEl ||
    !tbodyEl ||
    !countEl
  ) {
    return;
  }

  // Set the date label to "Wed, Dec 11, 2025" style
  const today = new Date();
  if (dateLabelEl) {
    dateLabelEl.textContent = formatDateLabel(today);
  }

  // Initial state: show loading, hide others
  loadingEl.style.display = "";
  errorEl.style.display = "none";
  emptyEl.style.display = "none";
  wrapperEl.style.display = "none";
  tbodyEl.innerHTML = "";
  countEl.textContent = "";

  try {
    const response = await fetch("/api/stats/games-today", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const games = normalizeGamesPayload(json);

    loadingEl.style.display = "none";

    if (!games || games.length === 0) {
      emptyEl.style.display = "";
      countEl.textContent = "0 games today";
      return;
    }

    // Render rows
    for (const game of games) {
      const tr = document.createElement("tr");

      const homeAbbr =
        game.home_team?.abbreviation ||
        game.home_team_abbr ||
        game.home_abbr ||
        "HOME";

      const awayAbbr =
        game.visitor_team?.abbreviation ||
        game.away_team?.abbreviation ||
        game.visitor_team_abbr ||
        game.away_abbr ||
        "AWAY";

      const matchupText = `${awayAbbr} @ ${homeAbbr}`;

      const tipoff =
        game.tipoff_local ||
        game.tipoff ||
        game.start_time ||
        game.game_time ||
        game.date ||
        "TBD";

      const status =
        game.status ||
        game.game_status ||
        (game.finished ? "Final" : "Scheduled");

      // Matchup cell
      const matchupTd = document.createElement("td");
      matchupTd.textContent = matchupText;

      // Tipoff cell
      const timeTd = document.createElement("td");
      timeTd.textContent = tipoff;

      // Status cell
      const statusTd = document.createElement("td");
      statusTd.textContent = status;

      // Actions cell
      const actionTd = document.createElement("td");
      actionTd.style.textAlign = "right";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-button";
      btn.textContent = "View props / stats";
      btn.dataset.gameId = String(game.id ?? "");

      // Placeholder for later: hook this into a modal or detail pane.
      btn.addEventListener("click", () => {
        console.log("Clicked game", game.id, matchupText);
        // Future: open props/stat detail UI.
      });

      actionTd.appendChild(btn);

      tr.appendChild(matchupTd);
      tr.appendChild(timeTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionTd);

      tbodyEl.appendChild(tr);
    }

    wrapperEl.style.display = "";
    countEl.textContent =
      games.length === 1 ? "1 game today" : `${games.length} games today`;
  } catch (err) {
    console.error("Failed to load today’s games:", err);
    loadingEl.style.display = "none";
    emptyEl.style.display = "none";
    wrapperEl.style.display = "none";
    errorEl.style.display = "";
    countEl.textContent = "Error loading games";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadTodaysGames();
});
