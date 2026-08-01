import { Game } from "./game.js";

const canvas = document.getElementById("game");
const titleScreen = document.getElementById("title-screen");
const hudEl = document.getElementById("hud");
const pauseHint = document.getElementById("pause-hint");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnHome = document.getElementById("btn-home");
const hudDepth = document.getElementById("hud-depth");
const hudMass = document.getElementById("hud-mass");

const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
    pauseHint.classList.add("hidden");
    pauseHint.classList.remove("visible");
  },
  setDepth(name) {
    hudDepth.textContent = name;
  },
  setMass(mass) {
    hudMass.textContent = `质量 ${mass.toFixed(1)}`;
  },
  setIdleHint(visible) {
    if (visible) {
      pauseHint.classList.remove("hidden");
      requestAnimationFrame(() => pauseHint.classList.add("visible"));
    } else {
      pauseHint.classList.remove("visible");
      pauseHint.classList.add("hidden");
    }
  },
};

const overlay = {
  show(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayEl.classList.remove("hidden");
  },
  hide() {
    overlayEl.classList.add("hidden");
  },
};

const game = new Game({ canvas, hud, overlay });
game.init();

game.onStateChange = (state) => {
  if (state === "title") {
    titleScreen.classList.remove("hidden");
  } else if (state === "playing") {
    titleScreen.classList.add("hidden");
  }
};

btnStart.addEventListener("click", () => {
  titleScreen.classList.add("hidden");
  game.start(0);
});

btnRetry.addEventListener("click", () => {
  overlay.hide();
  game.start(0);
});

btnHome.addEventListener("click", () => {
  game.goHome();
  titleScreen.classList.remove("hidden");
});

// Prevent page scroll / pull-to-refresh while playing on mobile
document.addEventListener(
  "touchmove",
  (e) => {
    if (!titleScreen.classList.contains("hidden")) return;
    e.preventDefault();
  },
  { passive: false }
);
