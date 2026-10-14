// Keep the title and creator navigation responsive even if the optional
// 3D preview fails to initialize or its module dependencies are unavailable.
const titleScreen = document.querySelector("#title");
const creatorScreen = document.querySelector("#creator");

document.querySelector("#newChar")?.addEventListener("click", () => {
  titleScreen.dataset.cinematicDismissed = "true";
  document.querySelector("#loadMsg").textContent = "";
  titleScreen.classList.add("hidden");
  creatorScreen.classList.remove("hidden");
});

document.querySelector("#cBack")?.addEventListener("click", () => {
  creatorScreen.classList.add("hidden");
  titleScreen.classList.remove("hidden");
});
