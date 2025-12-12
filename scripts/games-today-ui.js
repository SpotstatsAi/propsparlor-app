// scripts/games-today-ui.js
// Wires the "Today's Games" view to /api/stats/games-today.

function normalizeGamesPayload(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.games)) return json.games;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

function fmtTipoff(raw) {
  if (!raw) return "TBD";

  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;

    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch (e) {
    return raw;
  }
}

function extractStatus(game) {
  // Prefer explicit status fields
  if (game.status && typeof game.status === "string") return game.status;
  if (game.game_status && typeof game.game_status === "string") return game.game_status;

  // If finished flag exists
  if (game.finished === true) return "Final";

  return "Scheduled";
}

async function loadTodaysGames() {
  const loadingEl = document.getElementById("games-today-loading");
  const errorEl = document.getElementById("games-today-error");
  const emptyEl = document.getElementById("games-today-empty");
  const wrapperEl = document.getElementById("games-today-wrapper");
  const tbodyEl = document.getElementById("games-today-body");

  if (!loadingEl || !errorEl || !emptyEl || !wrapperEl || !tbodyEl) return;

  loadingEl.style.display = "";
  errorEl.style.display = "none";
  emptyEl.style.display = "none";
  wrapperEl.style.display = "none";
  tbodyEl.innerHTML = "";

  try {
    const res = await fetch("/api/stats/games-today", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const games = normalizeGamesPayload(json);

    loadingEl.style.display = "none";

    if (!games || games.length === 0) {
      emptyEl.style.display = "";
      return;
    }

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

      const matchupTd = document.createElement("td");
      matchupTd.textContent = `${awayAbbr} @ ${homeAbbr}`;

      // format tipoff cleanly
      const rawTip = game.tipoff_local || game.tipoff || game.start_time || game.date;
      const timeTd = document.createElement("td");
      timeTd.textContent = fmtTipoff(rawTip);

      // clean status
      const statusTd = document.createElement("td");
      statusTd.textContent = extractStatus(game);

      // actions
      const actionTd = document.createElement("td");
      actionTd.style.textAlign = "right";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-button";
      btn.textContent = "View props / stats";
      btn.dataset.gameId = String(game.id ?? "");

      btn.addEventListener("click", () => {
        console.log("Clicked game", game.id, matchupTd.textContent);
      });

      actionTd.appendChild(btn);

      tr.appendChild(matchupTd);
      tr.appendChild(timeTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionTd);

      tbodyEl.appendChild(tr);
    }

    wrapperEl.style.display = "";
  } catch (err) {
    console.error("Failed to load today's games:", err);
    loadingEl.style.display = "none";
    emptyEl.style.display = "none";
    wrapperEl.style.display = "none";
    errorEl.style.display = "";
  }
}

document.addEventListener("DOMContentLoaded", loadTodaysGames);
