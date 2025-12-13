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
// - Thread 8C: Parlay Summary card (placeholder odds + stake + est payout)

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

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return n;
    return Math.max(min, Math.min(max, n));
  }

  function flashPickRow(pickId) {
    const listEl = getListEl();
    if (!listEl) return;

    const row = listEl.querySelector(`[data-pick-id="${pickId}"]`);
    if (!row) return;

    row.scrollIntoView({ behavior: "smooth", block: "nearest" });

    try {
      row.animate(
        [
          { transform: "translateY(0px)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
          {
            transform: "translateY(-1px)",
            boxShadow: "0 0 0.85rem rgba(0,255,180,0.35)",
          },
          { transform: "translateY(0px)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
        ],
        { duration: 650, easing: "ease-out" }
      );
    } catch (_) {}
  }

  // ---------------------------
  // Thread 8C — Parlay Summary (placeholder odds)
  // (Kept for compatibility; does not override your index.html summary)
  // ---------------------------

  const summaryState = {
    stake: 10,
    perLegAmerican: -110,
  };

  function americanToDecimal(american) {
    const a = safeNumber(american);
    if (a === null || a === 0) return null;
    if (a > 0) return 1 + a / 100;
    return 1 + 100 / Math.abs(a);
  }

  function fmtMoney(n) {
    if (!Number.isFinite(n)) return "—";
    return `$${n.toFixed(2)}`;
  }

  function ensureSummaryCard(listEl) {
    if (!listEl) return null;

    const parent = listEl.parentElement;
    if (!parent) return null;

    // If index.html already provides the summary, use it as-is.
    let card = parent.querySelector("#pp-slip-summary");
    if (card) return card;

    // (Fallback only; normally not used since your index.html has it.)
    card = document.createElement("div");
    card.id = "pp-slip-summary";
    card.style.borderRadius = "18px";
    card.style.border = "1px solid rgba(0,255,180,0.14)";
    card.style.background = "rgba(0,0,0,0.14)";
    card.style.boxShadow = "0 0 22px rgba(0,255,180,0.10)";
    card.style.padding = "12px 12px 10px";
    card.style.marginBottom = "12px";

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
        <div style="font-size:0.78rem; letter-spacing:0.14em; text-transform:uppercase; opacity:0.90;">
          Parlay Summary
        </div>
        <div style="font-size:0.72rem; opacity:0.65; white-space:nowrap;">
          Placeholder odds
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
        <div>
          <div style="font-size:0.70rem; opacity:0.65; letter-spacing:0.10em; text-transform:uppercase; margin-bottom:6px;">Legs</div>
          <div id="pp-slip-legs" style="font-size:1.05rem; font-weight:600;">0</div>
        </div>

        <div>
          <div style="font-size:0.70rem; opacity:0.65; letter-spacing:0.10em; text-transform:uppercase; margin-bottom:6px;">Per-leg odds</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <select id="pp-slip-odds-preset"
              style="flex:1; padding:8px 10px; border-radius:999px; border:1px solid rgba(0,255,180,0.22); background:rgba(0,0,0,0.22); color:inherit; outline:none;">
              <option value="-110">-110 (default)</option>
              <option value="-120">-120</option>
              <option value="-105">-105</option>
              <option value="+100">+100</option>
              <option value="custom">Custom</option>
            </select>
            <input id="pp-slip-odds-custom" type="number" inputmode="numeric" placeholder="-110"
              style="width:84px; padding:8px 10px; border-radius:999px; border:1px solid rgba(0,255,180,0.22); background:rgba(0,0,0,0.22); color:inherit; outline:none; display:none;" />
          </div>
        </div>

        <div style="grid-column:1 / -1;">
          <div style="font-size:0.70rem; opacity:0.65; letter-spacing:0.10em; text-transform:uppercase; margin-bottom:6px;">Stake</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input id="pp-slip-stake" type="number" step="1" min="1" value="10"
              style="flex:1; padding:8px 10px; border-radius:999px; border:1px solid rgba(0,255,180,0.22); background:rgba(0,0,0,0.22); color:inherit; outline:none;" />
            <button id="pp-slip-build" type="button" class="player-pill" style="padding:8px 12px;">
              Build Parlay (Coming Soon)
            </button>
          </div>
        </div>
      </div>

      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div style="font-size:0.70rem; opacity:0.65; letter-spacing:0.10em; text-transform:uppercase; margin-bottom:4px;">Estimated return</div>
          <div id="pp-slip-return" style="font-size:1.05rem; font-weight:650;">—</div>
          <div id="pp-slip-profit" style="font-size:0.80rem; opacity:0.70; margin-top:2px;">—</div>
        </div>

        <div style="font-size:0.72rem; opacity:0.62; line-height:1.35; max-width:220px;">
          Uses assumed odds per leg to estimate payout. Real lines will replace this later.
        </div>
      </div>
    `;

    parent.insertBefore(card, listEl);
    bindSummaryEvents(card);

    return card;
  }

  function getActiveAmericanOdds(card) {
    const preset = card.querySelector("#pp-slip-odds-preset");
    const custom = card.querySelector("#pp-slip-odds-custom");
    if (!preset) return summaryState.perLegAmerican;

    if (preset.value === "custom") {
      const n = safeNumber(custom ? custom.value : null);
      return n === null ? summaryState.perLegAmerican : n;
    }

    const n = safeNumber(preset.value);
    return n === null ? summaryState.perLegAmerican : n;
  }

  function bindSummaryEvents(card) {
    if (!card || card.dataset.bound === "true") return;
    card.dataset.bound = "true";

    const stakeInput = card.querySelector("#pp-slip-stake");
    const preset = card.querySelector("#pp-slip-odds-preset");
    const custom = card.querySelector("#pp-slip-odds-custom");
    const buildBtn = card.querySelector("#pp-slip-build");

    if (buildBtn) {
      buildBtn.addEventListener("click", () => {
        console.log("Build Parlay: coming soon.");
      });
    }

    if (stakeInput) {
      stakeInput.addEventListener("change", () => {
        const n = safeNumber(stakeInput.value);
        if (n !== null) summaryState.stake = clamp(n, 1, 100000);
        renderSummary();
      });
    }

    if (preset) {
      preset.addEventListener("change", () => {
        if (!custom) return;

        if (preset.value === "custom") {
          custom.style.display = "block";
          custom.value = String(summaryState.perLegAmerican);
          custom.focus();
        } else {
          custom.style.display = "none";
          const n = safeNumber(preset.value);
          if (n !== null) summaryState.perLegAmerican = n;
        }
        renderSummary();
      });
    }

    if (custom) {
      custom.addEventListener("change", () => {
        const n = safeNumber(custom.value);
        if (n !== null && n !== 0) summaryState.perLegAmerican = n;
        renderSummary();
      });
    }
  }

  function renderSummary() {
    const listEl = getListEl();
    if (!listEl) return;

    const card = ensureSummaryCard(listEl);
    if (!card) return;

    const legsEl = card.querySelector("#pp-slip-legs");
    const retEl = card.querySelector("#pp-slip-return");
    const profEl = card.querySelector("#pp-slip-profit");
    const stakeInput = card.querySelector("#pp-slip-stake");

    const legs = state.picks.length;
    if (legsEl) legsEl.textContent = String(legs);

    if (stakeInput && Number.isFinite(summaryState.stake)) {
      stakeInput.value = String(Math.round(summaryState.stake));
    }

    if (!legs) {
      if (retEl) retEl.textContent = "—";
      if (profEl) profEl.textContent = "—";
      return;
    }

    const american = getActiveAmericanOdds(card);
    const perLegDecimal = americanToDecimal(american);

    if (!Number.isFinite(perLegDecimal)) {
      if (retEl) retEl.textContent = "—";
      if (profEl) profEl.textContent = "Invalid odds";
      return;
    }

    const combinedDecimal = Math.pow(perLegDecimal, legs);
    const stake = Number.isFinite(summaryState.stake) ? summaryState.stake : 10;
    const totalReturn = stake * combinedDecimal;
    const profit = totalReturn - stake;

    if (retEl) retEl.textContent = fmtMoney(totalReturn);
    if (profEl) profEl.textContent = `Profit: ${fmtMoney(profit)}`;
  }

  // ---------------------------
  // In-memory state
  // ---------------------------

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

    const newKey = pickKey(normalized);
    const existing = state.picks.find((p) => pickKey(p) === newKey);

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

    // Ensure / update summary first (so it exists even when list is empty)
    ensureSummaryCard(listEl);

    listEl.innerHTML = "";

    if (!state.picks.length) {
      ensurePlaceholderIfEmpty(listEl);
      renderSummary();
      return;
    }

    state.picks.forEach((p) => {
      const li = document.createElement("li");
      li.className = "slip-row";
      li.dataset.pickId = p.id;

      // Side hook for styling (accent rail, etc.)
      li.classList.add(p.side === "UNDER" ? "pick-under" : "pick-over");

      // --- Header row (title left, tag right)
      const header = document.createElement("div");
      header.className = "slip-row-header";

      const title = document.createElement("div");
      title.className = "slip-row-title";
      title.textContent = `${p.player_name} · ${p.stat_label}`;

      const tag = document.createElement("div");
      tag.className = "slip-row-tag";
      tag.textContent = `${p.side} · ${p.line.toFixed(1)}`;

      header.appendChild(title);
      header.appendChild(tag);

      // --- Sub line
      const sub = document.createElement("div");
      sub.className = "slip-row-sub";
      sub.textContent = `${p.team} · ${p.tab}`;

      // --- Controls row (no inline styles; CSS owns layout)
      const controls = document.createElement("div");
      controls.className = "slip-row-controls";

      const sideBtn = document.createElement("button");
      sideBtn.type = "button";
      sideBtn.className = "slip-action slip-toggle";
      sideBtn.textContent = p.side;
      sideBtn.addEventListener("click", () => {
        updatePick(p.id, { side: p.side === "OVER" ? "UNDER" : "OVER" });
      });

      const lineWrap = document.createElement("div");
      lineWrap.className = "slip-line";

      const lineLabel = document.createElement("span");
      lineLabel.className = "slip-line-label";
      lineLabel.textContent = "Line";

      const lineInput = document.createElement("input");
      lineInput.className = "slip-line-input";
      lineInput.type = "number";
      lineInput.step = "0.5";
      lineInput.value = p.line.toFixed(1);

      lineInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") lineInput.blur();
      });

      lineInput.addEventListener("change", () => {
        updatePick(p.id, { line: lineInput.value });
      });

      lineWrap.appendChild(lineLabel);
      lineWrap.appendChild(lineInput);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "slip-action slip-remove";
      removeBtn.textContent = "Remove";
      removeBtn.setAttribute("aria-label", "Remove pick");
      removeBtn.addEventListener("click", () => removePick(p.id));

      controls.appendChild(sideBtn);
      controls.appendChild(lineWrap);
      controls.appendChild(removeBtn);

      li.appendChild(header);
      li.appendChild(sub);
      li.appendChild(controls);

      listEl.appendChild(li);
    });

    renderSummary();
  }

  // Expose API
  const global = ensureGlobal();
  global.Slip = {
    addPick,
    removePick,
    list,
    render,
  };

  document.addEventListener("DOMContentLoaded", () => {
    render();
  });
})();
