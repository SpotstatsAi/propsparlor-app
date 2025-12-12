// Thread 1: UI shell only – no real data, just nav + view interactivity.

document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");
  const viewPanels = document.querySelectorAll("[data-view-panel]");

  function activateView(viewName) {
    // Toggle nav active state
    navItems.forEach((item) => {
      const itemView = item.getAttribute("data-view");
      if (itemView === viewName) {
        item.classList.add("nav-item-active");
      } else {
        item.classList.remove("nav-item-active");
      }
    });

    // Toggle view panels
    viewPanels.forEach((panel) => {
      const panelView = panel.getAttribute("data-view-panel");
      if (panelView === viewName) {
        panel.classList.add("view-active");
      } else {
        panel.classList.remove("view-active");
      }
    });
  }

  // Attach click handlers
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const targetView = item.getAttribute("data-view");
      if (!targetView) return;
      activateView(targetView);
    });
  });

  // Initial state
  activateView("overview");

  console.log("PropsParlor UI shell ready (Thread 1 views wired).");
});
