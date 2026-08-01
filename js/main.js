import { Game } from "./game.js";

const canvas = document.getElementById("game");
const titleScreen = document.getElementById("title-screen");
const hudEl = document.getElementById("hud");
const controlsRoot = document.getElementById("controls");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnHome = document.getElementById("btn-home");
const hudLayer = document.getElementById("hud-layer");
const hudForm = document.getElementById("hud-form");
const hudPoints = document.getElementById("hud-points");
const hudEvolve = document.getElementById("hud-evolve");
const boostBtn = document.getElementById("btn-boost");

const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
  },
  setInfo({ layer, form, points, need, canEvolve, boostReady, boosting }) {
    hudLayer.textContent = layer;
    hudForm.textContent = form;
    hudPoints.textContent = `蛋白质 ${points}${need === "MAX" ? "" : ` / ${need}`}`;
    hudEvolve.classList.toggle("ready", !!canEvolve);
    hudEvolve.classList.toggle("boosting", !!boosting);
    if (boosting) {
      hudEvolve.textContent = "加速中";
    } else if (canEvolve) {
      hudEvolve.textContent = "寻找 DNA 进化";
    } else if (need === "MAX") {
      hudEvolve.textContent = "终极形态";
    } else {
      hudEvolve.textContent = "收集蛋白质";
    }
    boostBtn.classList.toggle("cooling", !boostReady && !boosting);
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

const game = new Game({ canvas, controlsRoot, hud, overlay });
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
  game.start(0, true);
});

btnRetry.addEventListener("click", () => {
  overlay.hide();
  game.start(0, true);
});

btnHome.addEventListener("click", () => {
  game.goHome();
  titleScreen.classList.remove("hidden");
});

document.addEventListener(
  "touchmove",
  (e) => {
    if (!titleScreen.classList.contains("hidden")) return;
    e.preventDefault();
  },
  { passive: false }
);
