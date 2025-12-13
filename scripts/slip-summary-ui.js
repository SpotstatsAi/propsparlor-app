// scripts/slip-summary-ui.js
// Thread 8 – Parlay Summary UI (placeholder odds)
// Reads window.PropsParlor.Slip state and renders the summary card.
// Does NOT modify slip.js rendering or pick storage.

(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function getSlip() {
    return window.PropsParlor && window.PropsParlor.Slip ? window.PropsParlor.Slip : null;
  }

  function toNum(v) {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  function americanToDecimal(american) {
    const a = toNum(american);
    if (a === null || a === 0) return null;
    // American odds to decimal odds
    if (a > 0) return 1 + a / 100;
    return 1 + 100 / Math.abs(a);
  }

  function money(n) {
    if (!Number.isFinite(n)) return "$—";
    return `$${n.toFixed(2)}`;
  }

  function calc() {
    const slip = getSlip();
    const picks = slip ? slip.list() : [];

    const legsEl = $("pp-slip-legs");
    const perLegEl = $("pp-slip-perleg");
    const stakeEl = $("pp-slip-stake");
    const retEl = $("pp-slip-return");
    const profitEl = $("pp-slip-profit");
    const helperEl = $("pp-slip-helper");
    const buildBtn = $("pp-slip-build");

    if (!legsEl || !perLegEl || !stakeEl || !retEl || !profitEl) return;

    const legs = picks.length;
    legsEl.textContent = String(legs);

    // Disable build if no legs
    if (buildBtn) buildBtn.disabled = legs === 0;

    const stake = Math.max(0, toNum(stakeEl.value) || 0);
    const perLeg = toNum(perLegEl.value);
    const dec = americanToDecimal(perLeg);

    if (!legs || !dec || !stake) {
      retEl.textContent = "$—";
      profitEl.textContent = "$—";
      if (helperEl) {
        helperEl.textContent =
          legs === 0
            ? "Add picks to populate the summary."
            : "Enter stake and select assumed odds per leg.";
      }
      return;
    }

    const totalDecimal = Math.pow(dec, legs);
    const payout = stake * totalDecimal;
    const profit = payout - stake;

    retEl.textContent = money(payout);
    profitEl.textContent = money(profit);

    if (helperEl) {
      helperEl.textContent =
        "Uses assumed odds per leg to estimate payout. Real lines will replace this later.";
    }
  }

  function bind() {
    const perLegEl = $("pp-slip-perleg");
    const stakeEl = $("pp-slip-stake");

    if (perLegEl && !perLegEl.dataset.bound) {
      perLegEl.dataset.bound = "true";
      perLegEl.addEventListener("change", calc);
    }

    if (stakeEl && !stakeEl.dataset.bound) {
      stakeEl.dataset.bound = "true";
      stakeEl.addEventListener("input", calc);
    }

    // Recalc whenever the slip changes (we will emit pp:slip-changed from slip.js next)
    window.addEventListener("pp:slip-changed", calc);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    calc();
  });
})();
