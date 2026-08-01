import { Game } from "./game.js";

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
const boostBtn = document.getElementById("btn-boost");
const boostRingFill = document.getElementById("boost-ring-fill");
const BOOST_RING_LEN = 2 * Math.PI * 32;

const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
  },
  setInfo({ boostReady, boosting, boostRatio = 1 } = {}) {
    boostBtn.classList.toggle("cooling", !boostReady && !boosting);
    boostBtn.classList.toggle("boosting", !!boosting);
    if (boostRingFill) {
      const ratio = Math.max(0, Math.min(1, boostRatio));
      boostRingFill.style.strokeDasharray = `${BOOST_RING_LEN}`;
      boostRingFill.style.strokeDashoffset = `${BOOST_RING_LEN * (1 - ratio)}`;
    }
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
