import { Game } from "./game.js";

const app = document.getElementById("app");
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
const btnExit = document.getElementById("btn-exit");
const hudLayer = document.getElementById("hud-layer");
const hudForm = document.getElementById("hud-form");
const hudPoints = document.getElementById("hud-points");
const hudNuclei = document.getElementById("hud-nuclei");
const hudProteinLeft = document.getElementById("hud-protein-left");
const hudEvolve = document.getElementById("hud-evolve");
const boostBtn = document.getElementById("btn-boost");
const rotateHint = document.getElementById("rotate-hint");

const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
  },
  setInfo({
    layer,
    form,
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
    hudLayer.textContent = layer;
    hudForm.textContent = form;
    hudNuclei.textContent = `细胞核 ${nuclei} / ${nucleiMax}`;
    hudProteinLeft.textContent = exhausted
      ? "本层蛋白已尽"
      : `本层蛋白 ${proteinLeft} / ${proteinBudget}`;
    hudProteinLeft.classList.toggle("exhausted", !!exhausted);
    if (recovering) {
      hudPoints.textContent = `修复核 ${recoverProgress}/${recoverNeed}`;
    } else {
      hudPoints.textContent = `进化点 ${points}${need === "MAX" ? "" : ` / ${need}`}`;
    }
    hudEvolve.classList.toggle("ready", !!canEvolve || !!exhausted);
    hudEvolve.classList.toggle("boosting", !!boosting);
    if (boosting) {
      hudEvolve.textContent = "加速中";
    } else if (exhausted) {
      hudEvolve.textContent = "进入下一层";
    } else if (recovering) {
      hudEvolve.textContent = "吞噬蛋白质修复";
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

function isPortrait() {
  return window.matchMedia("(orientation: portrait)").matches;
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
  if (isPortrait() || isFullscreen()) return;
  try {
    await requestFs(app);
  } catch {
    try {
      await requestFs(document.documentElement);
    } catch {
      // 部分浏览器拒绝全屏 API；布局已用 100dvh 铺满可视区域
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

function syncOrientation() {
  const portrait = isPortrait();
  rotateHint.hidden = !portrait;
  if (portrait) {
    document.body.classList.add("portrait-lock");
  } else {
    document.body.classList.remove("portrait-lock");
  }
}

async function preferLandscape() {
  try {
    const orient = screen.orientation || screen.mozOrientation || screen.msOrientation;
    if (orient?.lock) {
      await orient.lock("landscape");
    }
  } catch {
    // ignore
  }
}

function returnToTitle() {
  overlay.hide();
  game.goHome();
  titleScreen.classList.remove("hidden");
  // 退出游戏后离开全屏，回到开始页
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
  await preferLandscape();
  if (isPortrait()) {
    syncOrientation();
    return;
  }
  await enterFullscreen();
  titleScreen.classList.add("hidden");
  game.start(0, true);
});

btnRetry.addEventListener("click", async () => {
  await preferLandscape();
  if (isPortrait()) {
    syncOrientation();
    return;
  }
  await enterFullscreen();
  overlay.hide();
  game.start(0, true);
});

btnHome.addEventListener("click", () => {
  returnToTitle();
});

btnExit.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  returnToTitle();
});

document.addEventListener(
  "touchmove",
  (e) => {
    if (!titleScreen.classList.contains("hidden") && rotateHint.hidden) return;
    e.preventDefault();
  },
  { passive: false }
);

window.addEventListener("orientationchange", () => {
  setTimeout(async () => {
    syncOrientation();
    if (!isPortrait() && titleScreen.classList.contains("hidden")) {
      await enterFullscreen();
    }
    game.renderer.resize();
  }, 160);
});

window.addEventListener("resize", () => {
  syncOrientation();
  game.renderer.resize();
});

document.addEventListener("fullscreenchange", () => game.renderer.resize());
document.addEventListener("webkitfullscreenchange", () => game.renderer.resize());

syncOrientation();
