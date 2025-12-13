// scripts/slip.js
// Thread 8 – Pick Slip system (memory-only, editable)
//
// Owns the internal representation of a prop "pick" and renders it
// into <ul class="slip-list">.
//
// Enhancements:
// - Editable OVER / UNDER
// - Editable LINE
// - Live in-memory updates (no backend)

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

  function ensurePlaceholderIfEmpty(listEl) {
    if (!listEl || listEl.children.length) return;

    const li = document.createElement("li");
    li.className = "slip-placeholder-row";

    li.innerHTML = `
      <span class="slip-placeholder-label">No picks added</span>
      <span class="slip-placeholder-sub">Future: click a prop to send it here.</span>
    `;

    listEl.appendChild(li);
  }

  function roundToHalf(n) {
    if (!Number.isFinite(n)) return n;
    return Math.round(n * 2) / 2;
  }

  function pickKey(p) {
    return [p.player_id, p.stat_key, p.tab, p.side, p.line].join("|");
  }

  function createId() {
    return `pick_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  const state = {
    picks: [],
  };

  function list() {
    return state.picks.slice();
  }

  function addPick(pick) {
    if (!pick || !pick.player_id || !pick.stat_key) return;

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

    const exists = state.picks.some((p) => pickKey(p) === pickKey(normalized));
    if (exists) {
      render();
      return;
    }

    state.picks.push(normalized);
    render();
  }

  function updatePick(id, updates) {
    const p = state.picks.find((x) => x.id === id);
    if (!p) return;

    if (updates.side) p.side = updates.side;
    if (updates.line !== undefined) {
      const n = roundToHalf(Number(updates.line));
      if (Number.isFinite(n)) p.line = n;
    }

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

    state.picks.forEach((p) => {
      const li = document.createElement("li");
      li.className = "slip-row";

      const title = document.createElement("div");
      title.className = "slip-row-title";
      title.textContent = `${p.player_name} · ${p.stat_label}`;

      const sub = document.createElement("div");
      sub.className = "slip-row-sub";
      sub.textContent = `${p.team} · ${p.tab}`;

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.flexWrap = "wrap";
      controls.style.gap = "8px";

      // OVER / UNDER toggle
      const sideBtn = document.createElement("button");
      sideBtn.className = "player-pill";
      sideBtn.textContent = p.side;
      sideBtn.addEventListener("click", () => {
        updatePick(p.id, { side: p.side === "OVER" ? "UNDER" : "OVER" });
      });

      // Line input
      const lineInput = document.createElement("input");
      lineInput.type = "number";
      lineInput.step = "0.5";
      lineInput.value = p.line.toFixed(1);
      lineInput.addEventListener("change", () => {
        updatePick(p.id, { line: lineInput.value });
      });

      // Remove
      const removeBtn = document.createElement("button");
      removeBtn.className = "player-pill";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removePick(p.id));

      controls.appendChild(sideBtn);
      controls.appendChild(lineInput);
      controls.appendChild(removeBtn);

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(controls);

      listEl.appendChild(li);
    });
  }

  const global = ensureGlobal();
  global.Slip = {
    addPick,
    removePick,
    list,
    render,
  };

  document.addEventListener("DOMContentLoaded", render);
})();
