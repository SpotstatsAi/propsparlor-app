// scripts/main.js
// Handles left-nav view switching and kicks off the "Today's Games" loader.

(function () {
  function initNav() {
    const navItems = document.querySelectorAll(".nav-item[data-view]");
    const views = document.querySelectorAll(".view[data-view-panel]");

    if (!navItems.length || !views.length) return;

    function activate(viewName) {
      navItems.forEach((btn) => {
        const isActive = btn.getAttribute("data-view") === viewName;
        btn.classList.toggle("nav-item-active", isActive);
      });

      views.forEach((panel) => {
        const isActive = panel.getAttribute("data-view-panel") === viewName;
        panel.classList.toggle("view-active", isActive);
      });
    }

    navItems.forEach((btn) => {
      btn.addEventListener("click", () => {
        const viewName = btn.getAttribute("data-view");
        if (!viewName) return;
        activate(viewName);
      });
    });

    // Respect whatever is pre-marked as active, fallback to "overview".
    const currentActive = document.querySelector(".nav-item.nav-item-active");
    const initialView =
      (currentActive && currentActive.getAttribute("data-view")) ||
      "overview";

    activate(initialView);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();

    // If the games UI helper is present, initialize it once on load.
    if (typeof window.initGamesToday === "function") {
      window.initGamesToday();
    }
  });
})();
