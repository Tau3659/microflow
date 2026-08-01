import { Game } from "./game.js";
import { EVOLUTIONS as EVOS, LAYERS as LYRS } from "./config.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game");
const titleScreen = document.getElementById("title-screen");
const hudEl = document.getElementById("hud");
const controlsRoot = document.getElementById("controls");
const overlayEl = document.getElementById("overlay");
const overlayVisual = document.getElementById("overlay-visual");
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnHome = document.getElementById("btn-home");
const btnExit = document.getElementById("btn-exit");
const hudDepth = document.getElementById("hud-depth");
const hudFormPips = document.getElementById("hud-form-pips");
const hudNuclei = document.getElementById("hud-nuclei");
const hudProteinFill = document.getElementById("hud-protein-fill");
const hudProgressFill = document.getElementById("hud-progress-fill");
const hudProgressIcon = document.getElementById("hud-progress-icon");
const hudStatus = document.getElementById("hud-status");
const proteinMeter = document.querySelector(".protein-meter");
const boostBtn = document.getElementById("btn-boost");

function renderPips(container, total, active) {
  container.innerHTML = "";
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("span");
    if (i <= active) dot.classList.add("on");
    container.appendChild(dot);
  }
}

function renderNuclei(container, alive, max) {
  container.innerHTML = "";
  for (let i = 0; i < max; i += 1) {
    const dot = document.createElement("span");
    dot.classList.add(i < alive ? "on" : "off");
    container.appendChild(dot);
  }
}

const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
  },
  setInfo({
    layerIndex = 0,
    evolutionId = 0,
    points,
    need,
    nuclei,
    nucleiMax,
    proteinLeft,
    proteinBudget,
    recoverProgress,
    recoverNeed,
    recovering,
    exhausted,
    canEvolve,
    boostReady,
    boosting,
  }) {
    renderPips(hudDepth, LYRS.length, layerIndex);
    renderPips(hudFormPips, EVOS.length, evolutionId);
    renderNuclei(hudNuclei, nuclei, nucleiMax);

    const proteinRatio =
      proteinBudget > 0 ? Math.max(0, Math.min(1, proteinLeft / proteinBudget)) : 0;
    hudProteinFill.style.width = `${proteinRatio * 100}%`;
    proteinMeter.classList.toggle("exhausted", !!exhausted);

    let progress = 0;
    hudProgressFill.classList.remove("recover");
    hudProgressIcon.classList.remove("portal", "recover");
    if (recovering) {
      progress = recoverNeed ? recoverProgress / recoverNeed : 0;
      hudProgressFill.classList.add("recover");
      hudProgressIcon.classList.add("recover");
    } else if (exhausted || canEvolve) {
      progress = 1;
      if (exhausted) hudProgressIcon.classList.add("portal");
    } else if (need === "MAX" || need === Infinity) {
      progress = 1;
    } else {
      progress = need ? Math.min(1, points / need) : 0;
    }
    hudProgressFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;

    hudStatus.className = "status-dot";
    if (boosting) hudStatus.classList.add("boosting");
    else if (canEvolve || exhausted) hudStatus.classList.add("ready");

    boostBtn.classList.toggle("cooling", !boostReady && !boosting);
  },
};

const overlay = {
  show(kind = "end") {
    overlayVisual.classList.toggle("win", kind === "win");
    overlayVisual.classList.toggle("end", kind !== "win");
    overlayEl.classList.remove("hidden");
  },
  hide() {
    overlayEl.classList.add("hidden");
  },
};

const game = new Game({ canvas, controlsRoot, hud, overlay });
game.init();

function isPortrait() {
  if (window.matchMedia("(orientation: portrait)").matches) return true;
  // 部分浏览器旋转瞬间 media 未更新，用宽高兜底
  return window.innerHeight > window.innerWidth;
}

function isFullscreen() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

async function requestFs(el) {
  if (el.requestFullscreen) {
    try {
      await el.requestFullscreen({ navigationUI: "hide" });
      return;
    } catch {
      await el.requestFullscreen();
      return;
    }
  }
  if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
    return;
  }
  if (el.msRequestFullscreen) {
    el.msRequestFullscreen();
  }
}

async function enterFullscreen() {
  if (isFullscreen()) return;
  try {
    await requestFs(app);
  } catch {
    try {
      await requestFs(document.documentElement);
    } catch {
      // ignore
    }
  }
  setTimeout(() => game.renderer.resize(), 80);
}

async function exitFullscreen() {
  if (!isFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  } catch {
    // ignore
  }
  setTimeout(() => game.renderer.resize(), 80);
}

/** 旋转时切换横/竖屏 UI 布局类 */
function syncOrientation() {
  const portrait = isPortrait();
  document.body.classList.toggle("is-portrait", portrait);
  document.body.classList.toggle("is-landscape", !portrait);
  // 旋转后重置摇杆视觉位置，避免错位
  const knob = document.getElementById("virtual-knob");
  if (knob) knob.style.transform = "translate(-50%, -50%)";
  game.input.dirX = 0;
  game.input.dirY = 0;
  game.input.boostPressed = false;
  boostBtn.classList.remove("active");
  document.getElementById("virtual-pad")?.classList.remove("active");
}

function returnToTitle() {
  overlay.hide();
  game.goHome();
  titleScreen.classList.remove("hidden");
  exitFullscreen();
}

game.onStateChange = (state) => {
  if (state === "title") {
    titleScreen.classList.remove("hidden");
  } else if (state === "playing") {
    titleScreen.classList.add("hidden");
  }
};

btnStart.addEventListener("click", async () => {
  await enterFullscreen();
  titleScreen.classList.add("hidden");
  syncOrientation();
  game.renderer.resize();
  game.start(0, true);
});

btnRetry.addEventListener("click", async () => {
  await enterFullscreen();
  overlay.hide();
  syncOrientation();
  game.renderer.resize();
  game.start(0, true);
});

btnHome.addEventListener("click", () => returnToTitle());
btnExit.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  returnToTitle();
});

document.addEventListener(
  "touchmove",
  (e) => {
    if (!titleScreen.classList.contains("hidden")) return;
    e.preventDefault();
  },
  { passive: false }
);

function onViewportChange() {
  syncOrientation();
  game.renderer.resize();
}

window.addEventListener("orientationchange", () => {
  // 旋转后尺寸可能延迟更新，连续校正几次
  onViewportChange();
  setTimeout(onViewportChange, 120);
  setTimeout(onViewportChange, 320);
});

window.addEventListener("resize", onViewportChange);

if (screen.orientation?.addEventListener) {
  screen.orientation.addEventListener("change", () => {
    onViewportChange();
    setTimeout(onViewportChange, 120);
  });
}

document.addEventListener("fullscreenchange", () => {
  syncOrientation();
  game.renderer.resize();
});
document.addEventListener("webkitfullscreenchange", () => {
  syncOrientation();
  game.renderer.resize();
});

syncOrientation();
