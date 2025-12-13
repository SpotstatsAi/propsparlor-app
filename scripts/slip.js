// scripts/slip.js
// Thread 8 – Pick Slip system (memory-only)
//
// Owns the internal representation of a prop "pick" and renders it
// into the existing <ul class="slip-list"> in index.html.
//
// Pick shape:
// {
//   id: string,
//   player_id: number,
//   player_name: string,
//   team: string,
//   stat_key: string,     // pts | reb | ast | pra | fg3m
//   stat_label: string,   // PTS | REB | AST | PRA | 3PM
//   tab: string,          // SEASON | L10 | L5
//   line: number,         // numeric line
//   side: string          // OVER | UNDER
// }

(function () {
  const DEFAULT_SIDE = "OVER";

  function $(sel) {
    return document.querySelector(sel);
  }

  function ensureGlobal() {
    window.PropsParlor = window.PropsParlor || {};
    return window.PropsParlor;
  }

  function getListEl() {
    return $(".slip-list");
  }

  function clearPlaceholder(listEl) {
    const placeholder = listEl.querySelector(".slip-placeholder-row");
    if (placeholder) placeholder.remove();
  }

  function ensurePlaceholderIfEmpty(listEl) {
    if (!listEl) return;
    if (listEl.children.length > 0) return;

    const li = document.createElement("li");
    li.className = "slip-placeholder-row";

    const a = document.createElement("span");
    a.className = "slip-placeholder-label";
    a.textContent = "No picks added";

    const b = document.createElement("span");
    b.className = "slip-placeholder-sub";
    b.textContent = "Future: click a prop to send it here.";

    li.appendChild(a);
    li.appendChild(b);
    listEl.appendChild(li);
  }

  function roundToHalf(n) {
    if (!Number.isFinite(n)) return n;
    return Math.round(n * 2) / 2;
  }

  function pickKey(p) {
    // Used to prevent duplicates in the slip
    return [
      p.player_id,
      p.stat_key,
      p.tab,
      p.side,
      p.line,
    ].join("|");
  }

  function createId() {
    return `pick_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  // In-memory state
  const state = {
    picks: [],
  };

  function list() {
    return state.picks.slice();
  }

  function addPick(pick) {
    if (!pick || !pick.player_id || !pick.stat_key) return;

    // Normalize
    const normalized = {
      id: pick.id || createId(),
      player_id: Number(pick.player_id),
      player_name: String(pick.player_name || "Unknown Player"),
      team: String(pick.team || "").toUpperCase().slice(0, 3),
      stat_key: String(pick.stat_key),
      stat_label: String(pick.stat_label || pick.stat_key).toUpperCase(),
      tab: String(pick.tab || "SEASON").toUpperCase(),
      line: roundToHalf(Number(pick.line)),
      side: String(pick.side || DEFAULT_SIDE).toUpperCase(),
    };

    if (!Number.isFinite(normalized.line)) return;

    const key = pickKey(normalized);
    const exists = state.picks.some((p) => pickKey(p) === key);
    if (exists) {
      render();
      return;
    }

    state.picks.push(normalized);
    render();
  }

  function removePick(id) {
    state.picks = state.picks.filter((p) => p.id !== id);
    render();
  }

  function render() {
    const listEl = getListEl();
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!state.picks.length) {
      ensurePlaceholderIfEmpty(listEl);
      return;
    }

    clearPlaceholder(listEl);

    state.picks.forEach((p) => {
      const li = document.createElement("li");
      li.className = "slip-row";
      li.dataset.pickId = p.id;

      const header = document.createElement("div");
      header.className = "slip-row-header";
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "10px";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "4px";
      left.style.minWidth = "0";

      const title = document.createElement("span");
      title.className = "slip-row-title";
      title.style.whiteSpace = "nowrap";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      title.textContent = `${p.player_name} · ${p.stat_label}`;

      const sub = document.createElement("div");
      sub.className = "slip-row-sub";
      sub.style.opacity = "0.85";
      sub.textContent = `${p.team} · ${p.tab} · ${p.side} ${p.line.toFixed(1)}`;

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.flexShrink = "0";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "player-pill";
      removeBtn.style.padding = "6px 10px";
      removeBtn.style.fontSize = "0.78rem";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removePick(p.id));

      right.appendChild(removeBtn);

      header.appendChild(left);
      header.appendChild(right);

      li.appendChild(header);
      listEl.appendChild(li);
    });
  }

  // Expose API
  const global = ensureGlobal();
  global.Slip = {
    addPick,
    removePick,
    list,
    render,
  };

  // Render placeholder on load
  document.addEventListener("DOMContentLoaded", () => {
    render();
  });
})();
