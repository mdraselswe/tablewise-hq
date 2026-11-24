// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var saved = localStorage.getItem("tw-theme");
    var dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch {
    /* storage blocked: keep the light theme */
  }
})();
