(function () {
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if ((a.getAttribute("href") || "").toLowerCase() === path) {
      a.classList.add("active");
    }
  });
})();

document.addEventListener("click", (e) => {
  const tip = e.target.closest(".infoTip");
  const anyOpen = document.querySelector(".infoTip.open");

  if (tip) {
    tip.classList.toggle("open");
    document.querySelectorAll(".infoTip.open").forEach(el => {
      if (el !== tip) el.classList.remove("open");
    });
    return;
  }

  if (anyOpen) anyOpen.classList.remove("open");
});
