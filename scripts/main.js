// scripts/main.js
// PropsParlor – view router + module bootstraps
// Ensures Today’s Games initializes when its panel is activated.

(function () {
  function $all(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function setActiveView(viewName) {
    // Toggle view panels
    $all(".view").forEach((view) => {
      const panelName = view.getAttribute("data-view-panel");
      view.classList.toggle("view-active", panelName === viewName);
    });

    // Toggle nav active state
    $all(".nav-item").forEach((btn) => {
      const target = btn.getAttribute("data-view");
      btn.classList.toggle("nav-item-active", target === viewName);
    });

    // Call per-view initializers (idempotent patterns)
    if (viewName === "games") {
      if (typeof window.initGamesToday === "function") {
        window.initGamesToday();
      } else {
        console.error("initGamesToday() is not available. Check scripts load order.");
      }
    }

    if (viewName === "players") {
      // Players view boot is handled inside players-ui.js via DOMContentLoaded,
      // but we keep this hook for future expansions.
      if (window.PropsParlor && typeof window.PropsParlor.openPlayersForGame === "function") {
        // no-op
      }
    }
  }

  function bindNav() {
    $all(".nav-item").forEach((btn) => {
      if (btn.dataset.bound === "true") return;
      btn.dataset.bound = "true";

      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-view");
        if (!target) return;
        setActiveView(target);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindNav();

    // Boot the default active view (if one is already active in markup),
    // otherwise default to "overview".
    const activeBtn = document.querySelector(".nav-item.nav-item-active");
    const initial = activeBtn?.getAttribute("data-view") || "overview";
    setActiveView(initial);
  });

  // Expose for debugging
  window.PropsParlor = window.PropsParlor || {};
  window.PropsParlor.setActiveView = setActiveView;
})();
