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

  function clampNonNeg(n) {
    if (!Number.isFinite(n)) return n;
    return Math.max(0, n);
  }

  function pickKey(p) {
    // Used to prevent duplicates in the slip (on add)
    return [p.player_id, p.stat_key, p.tab, p.side, p.line].join("|");
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
      line: roundToHalf(clampNonNeg(Number(pick.line))),
      side: String(pick.side || DEFAULT_SIDE).toUpperCase(),
    };

    if (!Number.isFinite(normalized.line)) return;
    if (normalized.side !== "OVER" && normalized.side !== "UNDER") normalized.side = DEFAULT_SIDE;

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

  function updatePick(id, patch) {
    if (!id || !patch) return;

    const idx = state.picks.findIndex((p) => p.id === id);
    if (idx < 0) return;

    const cur = state.picks[idx];
    const next = { ...cur };

    if (Object.prototype.hasOwnProperty.call(patch, "side")) {
      const s = String(patch.side || "").toUpperCase();
      if (s === "OVER" || s === "UNDER") next.side = s;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "line")) {
      const raw = Number(patch.line);
      const line = roundToHalf(clampNonNeg(raw));
      if (Number.isFinite(line)) next.line = line;
    }

    // If editing creates an exact duplicate of a different pick, merge by keeping
    // the earliest one and dropping the duplicate.
    const nextKey = pickKey(next);
    const dupIdx = state.picks.findIndex((p, i) => i !== idx && pickKey(p) === nextKey);
    if (dupIdx >= 0) {
      // Drop the edited row (or the duplicate) deterministically: keep the earlier index
      const keep = Math.min(idx, dupIdx);
      const drop = Math.max(idx, dupIdx);
      state.picks[keep] = next;
      state.picks.splice(drop, 1);
      render();
      return;
    }

    state.picks[idx] = next;
    render();
  }

  function toggleSide(id) {
    const p = state.picks.find((x) => x.id === id);
    if (!p) return;
    updatePick(id, { side: p.side === "OVER" ? "UNDER" : "OVER" });
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
      left.style.gap = "6px";
      left.style.minWidth = "0";

      const title = document.createElement("span");
      title.className = "slip-row-title";
      title.style.whiteSpace = "nowrap";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      title.textContent = `${p.player_name} · ${p.stat_label}`;

      const meta = document.createElement("div");
      meta.className = "slip-row-sub";
      meta.style.opacity = "0.85";
      meta.textContent = `${p.team} · ${p.tab}`;

      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";
      right.style.flexShrink = "0";
      right.style.flexWrap = "wrap";
      right.style.justifyContent = "flex-end";

      // OVER/UNDER toggle
      const sideBtn = document.createElement("button");
      sideBtn.type = "button";
      sideBtn.className = "player-pill";
      sideBtn.style.padding = "6px 10px";
      sideBtn.style.fontSize = "0.78rem";
      sideBtn.textContent = p.side === "UNDER" ? "UNDER" : "OVER";
      sideBtn.addEventListener("click", () => toggleSide(p.id));

      // Editable line input
      const lineWrap = document.createElement("div");
      lineWrap.style.display = "flex";
      lineWrap.style.alignItems = "center";
      lineWrap.style.gap = "6px";

      const lineLabel = document.createElement("span");
      lineLabel.className = "status-label";
      lineLabel.style.opacity = "0.75";
      lineLabel.style.fontSize = "0.72rem";
      lineLabel.style.letterSpacing = "0.08em";
      lineLabel.style.textTransform = "uppercase";
      lineLabel.textContent = "Line";

      const lineInput = document.createElement("input");
      lineInput.type = "number";
      lineInput.inputMode = "decimal";
      lineInput.step = "0.5";
      lineInput.min = "0";
      lineInput.value = Number.isFinite(p.line) ? p.line.toFixed(1) : "";
      lineInput.setAttribute("aria-label", "Edit line");
      lineInput.style.width = "86px";
      lineInput.style.padding = "6px 8px";
      lineInput.style.borderRadius = "10px";
      lineInput.style.border = "1px solid rgba(255,255,255,0.12)";
      lineInput.style.background = "rgba(0,0,0,0.25)";
      lineInput.style.color = "inherit";
      lineInput.style.outline = "none";

      // Apply on change + also on blur (covers mobile)
      const applyLine = () => {
        const raw = Number(lineInput.value);
        if (!Number.isFinite(raw)) {
          lineInput.value = Number.isFinite(p.line) ? p.line.toFixed(1) : "";
          return;
        }
        updatePick(p.id, { line: raw });
      };
      lineInput.addEventListener("change", applyLine);
      lineInput.addEventListener("blur", applyLine);

      lineWrap.appendChild(lineLabel);
      lineWrap.appendChild(lineInput);

      // Remove
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "player-pill";
      removeBtn.style.padding = "6px 10px";
      removeBtn.style.fontSize = "0.78rem";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removePick(p.id));

      // Right-side summary chip (side + line)
      const summary = document.createElement("span");
      summary.className = "panel-tag panel-tag-soft";
      summary.style.fontSize = "0.72rem";
      summary.style.whiteSpace = "nowrap";
      summary.textContent = `${p.side} ${Number.isFinite(p.line) ? p.line.toFixed(1) : "—"}`;

      right.appendChild(sideBtn);
      right.appendChild(lineWrap);
      right.appendChild(summary);
      right.appendChild(removeBtn);

      header.appendChild(left);
      header.appendChild(right);

      li.appendChild(header);
      listEl.appendChild(li);
    });
  }

  // Expose API (keep existing surface; add update helpers)
  const global = ensureGlobal();
  global.Slip = {
    addPick,
    removePick,
    updatePick,
    toggleSide,
    list,
    render,
  };

  // Render placeholder on load
  document.addEventListener("DOMContentLoaded", () => {
    render();
  });
})();
