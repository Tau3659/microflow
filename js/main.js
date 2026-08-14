import { Game } from "./game.js";
import { audio } from "./audio.js";

const app = document.getElementById("app");
const canvas = document.getElementById("game");
const titleScreen = document.getElementById("title-screen");
const hudEl = document.getElementById("hud");
const overlayEl = document.getElementById("overlay");
const overlayVisual = document.getElementById("overlay-visual");
const scoreLayer = document.getElementById("score-layer");
const scoreCreatures = document.getElementById("score-creatures");
const scoreProteins = document.getElementById("score-proteins");
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnHome = document.getElementById("btn-home");
const btnExit = document.getElementById("btn-exit");
const hudFloor = document.getElementById("hud-floor");
const meterProtein = document.getElementById("meter-protein");
const proteinFill = document.getElementById("protein-fill");
const meterDna = document.getElementById("meter-dna");
const dnaFill = document.getElementById("dna-fill");
const dnaIcon = document.getElementById("dna-icon");
const hudNuclei = document.getElementById("hud-nuclei");
const btnSettings = document.getElementById("btn-settings");
const settingsPanel = document.getElementById("settings-panel");
const btnSettingsClose = document.getElementById("btn-settings-close");
const toggleMusic = document.getElementById("toggle-music");
const toggleSfx = document.getElementById("toggle-sfx");
const volMusic = document.getElementById("vol-music");
const volSfx = document.getElementById("vol-sfx");
const hud = {
  show() {
    hudEl.classList.remove("hidden");
  },
  hide() {
    hudEl.classList.add("hidden");
  },
  setInfo({
    layerDisplay,
    points = 0,
    pointsToEvolve = 1,
    canEvolve = false,
    nuclei = [],
    recovering = false,
    recoverRatio = 0,
    proteinsExhausted = false,
  } = {}) {
    if (hudFloor && layerDisplay != null) {
      hudFloor.textContent = String(layerDisplay);
    }
    const pRatio = Math.max(0, Math.min(1, points / Math.max(1, pointsToEvolve)));
    if (proteinFill) proteinFill.style.width = `${pRatio * 100}%`;
    meterProtein?.classList.toggle("exhausted", !!proteinsExhausted);
    if (dnaFill) {
      if (recovering) {
        dnaFill.style.width = `${Math.max(0, Math.min(1, recoverRatio)) * 100}%`;
        dnaFill.classList.add("recover");
        dnaIcon?.classList.add("recover");
        dnaIcon?.classList.remove("portal");
      } else {
        dnaFill.style.width = `${(canEvolve ? 1 : pRatio) * 100}%`;
        dnaFill.classList.remove("recover");
        dnaIcon?.classList.remove("recover");
        dnaIcon?.classList.toggle("portal", !!canEvolve);
      }
    }
    if (hudNuclei) {
      const html = nuclei
        .map((on) => `<span class="${on ? "on" : "off"}"></span>`)
        .join("");
      if (hudNuclei.dataset.sig !== html) {
        hudNuclei.dataset.sig = html;
        hudNuclei.innerHTML = html;
      }
    }
  },
};

const overlay = {
  show(kind = "end", stats = null) {
    overlayVisual.classList.toggle("win", kind === "win");
    overlayVisual.classList.toggle("end", kind !== "win");
    if (stats) {
      scoreLayer.textContent = String(stats.layerDisplay ?? (stats.layer ?? 0) + 1);
      scoreCreatures.textContent = String(stats.creaturesEaten ?? 0);
      scoreProteins.textContent = String(stats.proteinsEaten ?? 0);
    }
    overlayEl.classList.remove("hidden");
  },
  hide() {
    overlayEl.classList.add("hidden");
  },
};

const game = new Game({ canvas, hud, overlay });
game.init();

function syncSettingsUi() {
  const s = audio.getSettings();
  toggleMusic.setAttribute("aria-pressed", s.musicEnabled ? "true" : "false");
  toggleSfx.setAttribute("aria-pressed", s.sfxEnabled ? "true" : "false");
  volMusic.value = String(Math.round(s.musicVolume * 100));
  volSfx.value = String(Math.round(s.sfxVolume * 100));
  volMusic.disabled = !s.musicEnabled;
  volSfx.disabled = !s.sfxEnabled;
}

function openSettings() {
  syncSettingsUi();
  settingsPanel.classList.remove("hidden");
  btnSettings.setAttribute("aria-expanded", "true");
  audio.unlock();
}

function closeSettings() {
  settingsPanel.classList.add("hidden");
  btnSettings.setAttribute("aria-expanded", "false");
}

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
  game.input.hide();
}

function returnToTitle() {
  overlay.hide();
  closeSettings();
  game.goHome();
  titleScreen.classList.remove("hidden");
  exitFullscreen();
}

game.onStateChange = (state) => {
  if (state === "title") {
    titleScreen.classList.remove("hidden");
  } else if (state === "playing") {
    titleScreen.classList.add("hidden");
    closeSettings();
  }
};

async function beginPlay() {
  // 先全屏再解锁：部分浏览器全屏后会挂起 AudioContext
  await enterFullscreen();
  await audio.unlock();
  await audio.ensurePlaying();
  syncOrientation();
  game.renderer.resize();
}

btnStart.addEventListener("click", async () => {
  titleScreen.classList.add("hidden");
  closeSettings();
  await beginPlay();
  game.start(0, true);
});

btnRetry.addEventListener("click", async () => {
  overlay.hide();
  await beginPlay();
  game.start(0, true);
});

btnHome.addEventListener("click", () => returnToTitle());
btnExit.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  returnToTitle();
});

btnSettings.addEventListener("click", () => {
  if (settingsPanel.classList.contains("hidden")) openSettings();
  else closeSettings();
});
btnSettingsClose.addEventListener("click", () => closeSettings());
settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) closeSettings();
});

toggleMusic.addEventListener("click", async () => {
  await audio.unlock();
  const on = toggleMusic.getAttribute("aria-pressed") !== "true";
  audio.applySettings({ musicEnabled: on });
  syncSettingsUi();
});

toggleSfx.addEventListener("click", async () => {
  await audio.unlock();
  const on = toggleSfx.getAttribute("aria-pressed") !== "true";
  audio.applySettings({ sfxEnabled: on });
  syncSettingsUi();
  if (on) audio.playEvolve();
});

volMusic.addEventListener("input", async () => {
  await audio.unlock();
  audio.applySettings({ musicVolume: Number(volMusic.value) / 100 });
});

volSfx.addEventListener("input", async () => {
  await audio.unlock();
  audio.applySettings({ sfxVolume: Number(volSfx.value) / 100 });
});

document.addEventListener(
  "touchmove",
  (e) => {
    if (!titleScreen.classList.contains("hidden")) return;
    e.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  "gesturestart",
  (e) => {
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
syncSettingsUi();
