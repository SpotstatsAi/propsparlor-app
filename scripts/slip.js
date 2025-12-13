// scripts/slip.js
// Thread 8 – Pick Slip system (memory-only, editable)
//
// Owns the internal representation of a prop "pick" and renders it
// into <ul class="slip-list">.
//
// Enhancements:
// - Editable OVER / UNDER
// - Editable LINE
// - Duplicate-pick feedback: scroll + pulse highlight (no duplicate rows)

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

  function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function flashPickRow(pickId) {
    const listEl = getListEl();
    if (!listEl) return;

    const row = listEl.querySelector(`[data-pick-id="${pickId}"]`);
    if (!row) return;

    // Scroll it into view in the slip panel
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Pulse highlight without requiring CSS changes
    try {
      row.animate(
        [
          { transform: "translateY(0px)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
          { transform: "translateY(-1px)", boxShadow: "0 0 0.85rem rgba(0,255,180,0.35)" },
          { transform: "translateY(0px)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
        ],
        { duration: 650, easing: "ease-out" }
      );
    } catch (_) {
      // no-op (older browsers)
    }
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

    const newKey = pickKey(normalized);
    const existing = state.picks.find((p) => pickKey(p) === newKey);

    // Duplicate: no new row. Scroll + pulse the existing row.
    if (existing) {
      render();
      setTimeout(() => flashPickRow(existing.id), 0);
      return;
    }

    state.picks.push(normalized);
    render();
    setTimeout(() => flashPickRow(normalized.id), 0);
  }

  function updatePick(id, updates) {
    const p = state.picks.find((x) => x.id === id);
    if (!p) return;

    if (updates.side) p.side = String(updates.side).toUpperCase();

    if (updates.line !== undefined) {
      const n = safeNumber(updates.line);
      if (n !== null) p.line = roundToHalf(n);
    }

    render();
    setTimeout(() => flashPickRow(p.id), 0);
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
      li.dataset.pickId = p.id;

      const title = document.createElement("div");
      title.className = "slip-row-title";
      title.textContent = `${p.player_name} · ${p.stat_label}`;

      const sub = document.createElement("div");
      sub.className = "slip-row-sub";
      sub.textContent = `${p.team} · ${p.tab}`;

      const controls = document.createElement("div");
      controls.style.display = "flex";
      controls.style.flexWrap = "wrap";
      controls.style.alignItems = "center";
      controls.style.gap = "8px";

      // Side toggle (OVER/UNDER)
      const sideBtn = document.createElement("button");
      sideBtn.type = "button";
      sideBtn.className = "player-pill";
      sideBtn.textContent = p.side;
      sideBtn.addEventListener("click", () => {
        updatePick(p.id, { side: p.side === "OVER" ? "UNDER" : "OVER" });
      });

      // Line input
      const lineWrap = document.createElement("div");
      lineWrap.style.display = "flex";
      lineWrap.style.alignItems = "center";
      lineWrap.style.gap = "6px";

      const lineLabel = document.createElement("span");
      lineLabel.style.fontSize = "0.72rem";
      lineLabel.style.opacity = "0.75";
      lineLabel.style.letterSpacing = "0.08em";
      lineLabel.style.textTransform = "uppercase";
      lineLabel.textContent = "Line";

      const lineInput = document.createElement("input");
      lineInput.type = "number";
      lineInput.step = "0.5";
      lineInput.value = p.line.toFixed(1);
      lineInput.style.width = "72px";
      lineInput.style.padding = "8px 10px";
      lineInput.style.borderRadius = "999px";
      lineInput.style.border = "1px solid rgba(0,255,180,0.22)";
      lineInput.style.background = "rgba(0,0,0,0.22)";
      lineInput.style.color = "inherit";
      lineInput.style.outline = "none";

      lineInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") lineInput.blur();
      });

      lineInput.addEventListener("change", () => {
        updatePick(p.id, { line: lineInput.value });
      });

      lineWrap.appendChild(lineLabel);
      lineWrap.appendChild(lineInput);

      // Remove
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "player-pill";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removePick(p.id));

      controls.appendChild(sideBtn);
      controls.appendChild(lineWrap);
      controls.appendChild(removeBtn);

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(controls);

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

  document.addEventListener("DOMContentLoaded", render);
})();
