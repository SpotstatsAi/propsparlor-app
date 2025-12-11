// Thread 1: UI shell only – no real data, just interactivity for the nav.

document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("nav-item-active"));
      item.classList.add("nav-item-active");
    });
  });

  // Simple sanity check in browser console
  console.log("PropsParlor UI shell ready (Thread 1).");
});
