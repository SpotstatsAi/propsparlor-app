// scripts/games-today-ui.js
// Wires the "Today's Games" view to /api/stats/games-today.

function normalizeGamesPayload(json) {
  // Be tolerant of different backend shapes:
  // - { ok: true, games: [...] }
  // - { ok: true, data: [...] }
  // - [ ... ]
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.games)) return json.games;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

async function loadTodaysGames() {
  const loadingEl = document.getElementById("games-today-loading");
  const errorEl = document.getElementById("games-today-error");
  const emptyEl = document.getElementById("games-today-empty");
  const wrapperEl = document.getElementById("games-today-wrapper");
  const tbodyEl = document.getElementById("games-today-body");

  // If this view isn't present, do nothing.
  if (!loadingEl || !errorEl || !emptyEl || !wrapperEl || !tbodyEl) {
    return;
  }

  // Initial state
  loadingEl.style.display = "";
  errorEl.style.display = "none";
  emptyEl.style.display = "none";
  wrapperEl.style.display = "none";
  tbodyEl.innerHTML = "";

  try {
    const res = await fetch("/api/stats/games-today", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

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

      const tipoff =
        game.tipoff_local ||
        game.tipoff ||
        game.start_time ||
        game.game_time ||
        game.date ||
        "TBD";

      const timeTd = document.createElement("td");
      timeTd.textContent = tipoff;

      const status =
        game.status ||
        game.game_status ||
        (game.finished ? "Final" : "Scheduled");

      const statusTd = document.createElement("td");
      statusTd.textContent = status;

      const actionTd = document.createElement("td");
      actionTd.style.textAlign = "right";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "link-button";
      btn.textContent = "View props / stats";
      btn.dataset.gameId = String(game.id ?? "");

      btn.addEventListener("click", () => {
        console.log("Clicked game", game.id, matchupTd.textContent);
        // Future thread: open detail/pick UI.
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

document.addEventListener("DOMContentLoaded", () => {
  loadTodaysGames();
});
