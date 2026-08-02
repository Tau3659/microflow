/**
 * 生物外观图鉴 / 编辑器
 * - 浏览全部 morph / species / 玩家进化 / 猎手 / Boss
 * - 右侧实时调参
 * - 导出 JSON，可用 npm run sync:looks 写回 js/config.js
 */
import {
  MORPH,
  SPECIES,
  SCALE,
  PLAYER_LOOK,
  WARNING,
  getEvolution,
  getLayer,
} from "../js/config.js";
import { Renderer } from "../js/renderer.js";
import { mouthBundle } from "../js/creature.js";

const STORAGE_KEY = "microflow.creatureLooks.v1";

const MORPH_LABELS = {
  [MORPH.BACILLUS]: "杆菌",
  [MORPH.COCCUS]: "球菌",
  [MORPH.SPIRILLUM]: "螺旋菌",
  [MORPH.COLONY]: "集群",
  [MORPH.VIRUS]: "病毒",
  [MORPH.PHAGE]: "噬菌体",
};

const FIELD_DEFS = [
  { key: "morph", type: "morph", label: "形态 morph" },
  { key: "radius", type: "range", label: "半径 radius", min: 10, max: 56, step: 0.5 },
  { key: "complexity", type: "range", label: "复杂度 complexity", min: 1, max: 16, step: 1 },
  { key: "aspect", type: "range", label: "长宽比 aspect", min: 0.8, max: 3.6, step: 0.05 },
  { key: "curve", type: "range", label: "弯曲 curve", min: 0, max: 1, step: 0.05 },
  { key: "flagella", type: "range", label: "鞭毛 flagella", min: 0, max: 8, step: 1 },
  { key: "spikes", type: "range", label: "刺突 spikes", min: 0, max: 24, step: 1 },
  { key: "colonyCells", type: "range", label: "集群细胞 colonyCells", min: 0, max: 16, step: 1 },
  { key: "capsidFacets", type: "range", label: "衣壳面 capsidFacets", min: 0, max: 14, step: 1 },
  { key: "organelles", type: "range", label: "细胞器 organelles", min: 0, max: 12, step: 1 },
  { key: "membraneLayers", type: "range", label: "膜层 membraneLayers", min: 1, max: 3, step: 1 },
  { key: "vacuoles", type: "range", label: "液泡 vacuoles", min: 0, max: 8, step: 1 },
  { key: "legs", type: "range", label: "尾丝 legs", min: 0, max: 6, step: 1 },
  { key: "facets", type: "range", label: "棱面 facets", min: 0, max: 10, step: 1 },
  { key: "cilia", type: "bool", label: "纤毛 cilia" },
  { key: "cellBridges", type: "bool", label: "细胞桥 cellBridges" },
  { key: "thin", type: "bool", label: "纤细 thin" },
  { key: "chain", type: "bool", label: "链状 chain" },
  { key: "lobed", type: "bool", label: "裂叶 lobed" },
  { key: "elongate", type: "bool", label: "拉长 elongate" },
  { key: "hollow", type: "bool", label: "中空 hollow" },
  { key: "bigMouth", type: "bool", label: "大嘴 bigMouth" },
  { key: "color", type: "color", label: "体色 color" },
  { key: "coreColor", type: "color", label: "核色 coreColor" },
  { key: "membrane", type: "color", label: "膜色 membrane" },
];

/** SPECIES 可安全回写的字段 */
const SPECIES_SYNC_KEYS = [
  "morph",
  "flagella",
  "spikes",
  "colonyCells",
  "cilia",
  "cellBridges",
  "capsidFacets",
  "curve",
  "aspect",
  "thin",
  "chain",
  "lobed",
  "elongate",
  "hollow",
  "facets",
  "legs",
  "tint",
];

const state = {
  entries: [],
  filter: "all",
  query: "",
  selectedId: null,
  overrides: loadOverrides(),
  spinning: true,
};

const els = {
  cardList: document.getElementById("card-list"),
  filters: document.getElementById("filters"),
  search: document.getElementById("search"),
  stage: document.getElementById("stage"),
  previewTitle: document.getElementById("preview-title"),
  previewMeta: document.getElementById("preview-meta"),
  editFields: document.getElementById("edit-fields"),
  toast: document.getElementById("toast"),
};

const stageRenderer = new Renderer(els.stage);
const thumbRenderers = new Map();

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveOverrides() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function defaultColors(tint) {
  return {
    color: tint || "#3ecfb0",
    coreColor: "#9be8d6",
    membrane: "#1a6b62",
  };
}

function baseCreature(partial = {}) {
  const radius = partial.radius ?? SCALE.npc;
  const morph = partial.morph || MORPH.COCCUS;
  const mouthCount = partial.bigMouth ? 1 : Math.max(1, partial.mouths || 1);
  const mouths = partial.bigMouth
    ? [{ mouthAngle: 0, mouthDist: 1.15, mouthRadius: Math.max(7, radius * 0.7) }]
    : mouthBundle(morph, radius, mouthCount).mouths;
  return {
    id: partial.id || "preview",
    kind: partial.kind || "normal",
    role: partial.role || null,
    x: 0,
    y: 0,
    angle: -Math.PI / 5,
    pulse: 0,
    radius,
    morph,
    color: partial.color || "#3ecfb0",
    coreColor: partial.coreColor || "#9be8d6",
    membrane: partial.membrane || "#1a6b62",
    complexity: partial.complexity ?? 3,
    flagella: partial.flagella || 0,
    spikes: partial.spikes || 0,
    colonyCells: partial.colonyCells || 0,
    cilia: !!partial.cilia,
    organelles: partial.organelles || 0,
    membraneLayers: partial.membraneLayers || 1,
    vacuoles: partial.vacuoles || 0,
    cellBridges: !!partial.cellBridges,
    capsidFacets: partial.capsidFacets || 0,
    legs: partial.legs || 0,
    facets: partial.facets || 0,
    curve: partial.curve || 0,
    aspect: partial.aspect || 1,
    thin: !!partial.thin,
    chain: !!partial.chain,
    lobed: !!partial.lobed,
    elongate: !!partial.elongate,
    hollow: !!partial.hollow,
    bigMouth: !!partial.bigMouth,
    capsule: partial.capsule || 0,
    mouths,
    mouthAngle: mouths[0]?.mouthAngle || 0,
    mouthDist: mouths[0]?.mouthDist || 0.02,
    mouthRadius: mouths[0]?.mouthRadius || radius * 0.32,
    nuclei: [{ ox: 0, oy: 0, alive: true, r: Math.max(3, radius * 0.22) }],
    ...partial,
  };
}

function buildEntries() {
  const entries = [];

  // Morph 模板
  for (const [key, morph] of Object.entries(MORPH)) {
    entries.push({
      id: `morph:${morph}`,
      group: "morph",
      title: MORPH_LABELS[morph] || key,
      subtitle: morph,
      syncTarget: null,
      base: baseCreature({
        morph,
        radius: SCALE.npc,
        complexity: 4,
        flagella: morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM ? 2 : 0,
        spikes: morph === MORPH.VIRUS || morph === MORPH.PHAGE ? 12 : 0,
        colonyCells: morph === MORPH.COLONY ? 7 : 0,
        cilia: morph === MORPH.COCCUS,
        cellBridges: morph === MORPH.COLONY,
        capsidFacets: morph === MORPH.VIRUS ? 8 : 0,
        aspect:
          morph === MORPH.BACILLUS
            ? 2.25
            : morph === MORPH.SPIRILLUM
              ? 2.7
              : morph === MORPH.PHAGE
                ? 1.2
                : 1.1,
        elongate: morph === MORPH.COCCUS,
        ...defaultColors(),
      }),
    });
  }

  // SPECIES
  for (const [id, sp] of Object.entries(SPECIES)) {
    const colors = defaultColors(sp.tint);
    entries.push({
      id: `species:${id}`,
      group: "species",
      title: id,
      subtitle: `${MORPH_LABELS[sp.morph] || sp.morph} · SPECIES`,
      syncTarget: { type: "SPECIES", id },
      base: baseCreature({
        morph: sp.morph,
        radius: SCALE.npc,
        complexity: 3,
        flagella: sp.flagella || 0,
        spikes: sp.spikes || 0,
        colonyCells: sp.colonyCells || 0,
        cilia: !!sp.cilia,
        cellBridges: !!sp.cellBridges,
        capsidFacets: sp.capsidFacets || 0,
        curve: sp.curve || 0,
        aspect: sp.aspect || 1.2,
        thin: !!sp.thin,
        chain: !!sp.chain,
        lobed: !!sp.lobed,
        elongate: !!sp.elongate,
        hollow: !!sp.hollow,
        facets: sp.facets || 0,
        legs: sp.legs || 0,
        ...colors,
      }),
    });
  }

  // 玩家进化
  for (let i = 0; i <= 4; i += 1) {
    const evo = getEvolution(i);
    entries.push({
      id: `evo:${i}`,
      group: "player",
      title: evo.name || `进化 ${i}`,
      subtitle: `player evo ${i} · ${evo.morph}`,
      syncTarget: { type: "EVOLUTION", id: i },
      base: baseCreature({
        kind: "player",
        morph: evo.morph,
        radius: evo.radius || SCALE.player[Math.min(i, SCALE.player.length - 1)],
        complexity: evo.complexity || 1,
        flagella: evo.flagella || 0,
        spikes: evo.spikes || 0,
        colonyCells: evo.colonyCells || 0,
        cilia: !!evo.cilia,
        organelles: evo.organelles || 0,
        membraneLayers: evo.membraneLayers || 1,
        vacuoles: evo.vacuoles || 0,
        cellBridges: !!evo.cellBridges,
        capsidFacets: evo.capsidFacets || 0,
        legs: evo.legs || 0,
        color: PLAYER_LOOK.color,
        coreColor: PLAYER_LOOK.coreColor,
        membrane: PLAYER_LOOK.membrane,
        aspect: evo.morph === MORPH.BACILLUS ? 2.2 : evo.morph === MORPH.SPIRILLUM ? 2.6 : 1.15,
      }),
    });
  }

  // 猎手
  entries.push({
    id: "hunter:mouthling",
    group: "hunter",
    title: "猎手 mouthling",
    subtitle: "HUD≥10 · 小体大嘴",
    syncTarget: { type: "HUNTER", id: "mouthling" },
    base: baseCreature({
      role: "hunter",
      morph: MORPH.BACILLUS,
      radius: SCALE.npc * 0.72,
      complexity: 3,
      flagella: 1,
      curve: 0.2,
      aspect: 1.55,
      elongate: true,
      bigMouth: true,
      color: WARNING.color,
      coreColor: WARNING.core,
      membrane: WARNING.membrane,
    }),
  });

  // Boss：四主题 + 精英样例
  for (let i = 0; i < 4; i += 1) {
    const layer = getLayer(i + 1);
    const b = layer.boss;
    entries.push({
      id: `boss:theme${i}`,
      group: "boss",
      title: b.name,
      subtitle: `Boss · ${layer.name}`,
      syncTarget: { type: "BOSS_THEME", id: i },
      base: baseCreature({
        kind: "boss",
        morph: b.morph,
        radius: b.radius || SCALE.boss,
        complexity: 6,
        flagella: b.flagella || 0,
        spikes: b.spikes || 0,
        colonyCells: b.colonyCells || 0,
        cilia: !!b.cilia,
        organelles: 4,
        membraneLayers: 2,
        vacuoles: 2,
        cellBridges: b.morph === MORPH.COLONY,
        capsidFacets: b.morph === MORPH.VIRUS ? 8 : 0,
        legs: b.morph === MORPH.PHAGE ? 3 : 0,
        aspect: b.morph === MORPH.BACILLUS ? 2.3 : b.morph === MORPH.SPIRILLUM ? 2.7 : 1.2,
        color: b.color,
        membrane: b.membrane,
        coreColor: "#ffe0dc",
      }),
    });
  }
  const eliteLayer = getLayer(8);
  const eb = eliteLayer.boss;
  entries.push({
    id: "boss:elite",
    group: "boss",
    title: eb.name,
    subtitle: "精英 Boss 样例 · HUD 9",
    syncTarget: null,
    base: baseCreature({
      kind: "boss",
      morph: eb.morph,
      radius: eb.radius || SCALE.boss,
      complexity: 10,
      flagella: eb.flagella || 0,
      spikes: eb.spikes || 0,
      colonyCells: eb.colonyCells || 0,
      cilia: !!eb.cilia,
      organelles: 8,
      membraneLayers: 3,
      vacuoles: 4,
      cellBridges: eb.morph === MORPH.COLONY,
      capsidFacets: eb.morph === MORPH.VIRUS || eb.morph === MORPH.PHAGE ? 10 : 0,
      color: eb.color,
      membrane: eb.membrane,
      coreColor: "#ffe8a0",
      aspect: 1.25,
    }),
  });

  return entries;
}

function resolvedCreature(entry) {
  const ov = state.overrides[entry.id] || {};
  const merged = { ...entry.base, ...ov };
  // 嘴随半径/大嘴变化重建
  const mouthCount = 1;
  if (merged.bigMouth) {
    merged.mouths = [
      {
        mouthAngle: 0,
        mouthDist: 1.15,
        mouthRadius: Math.max(7, merged.radius * 0.7),
      },
    ];
  } else {
    merged.mouths = mouthBundle(merged.morph, merged.radius, mouthCount).mouths;
  }
  merged.mouthAngle = merged.mouths[0].mouthAngle;
  merged.mouthDist = merged.mouths[0].mouthDist;
  merged.mouthRadius = merged.mouths[0].mouthRadius;
  return merged;
}

function resizeCanvas(canvas, renderer, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  renderer.dpr = dpr;
  renderer.w = cssW;
  renderer.h = cssH;
  renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function paintCreature(renderer, creature, cssW, cssH, opts = {}) {
  const ctx = renderer.ctx;
  ctx.clearRect(0, 0, cssW, cssH);
  if (!opts.skipBg) {
    const g = ctx.createRadialGradient(
      cssW * 0.5,
      cssH * 0.42,
      8,
      cssW * 0.5,
      cssH * 0.5,
      Math.max(cssW, cssH) * 0.55
    );
    g.addColorStop(0, "#12505c");
    g.addColorStop(0.55, "#041820");
    g.addColorStop(1, "#020b10");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
  }
  ctx.save();
  ctx.translate(cssW * 0.5, cssH * 0.52);
  const scale = opts.scale || Math.min(cssW, cssH) / (creature.radius * 4.2);
  ctx.scale(scale, scale);
  renderer.drawMorphBody(creature, 0.92, false);

  // 嘴
  const mouths = creature.mouths || [];
  for (let mi = 0; mi < mouths.length; mi += 1) {
    const m = mouths[mi];
    const facing = creature.angle + (m.mouthAngle ?? 0);
    const dist = creature.radius * (m.mouthDist ?? 0.02);
    const r = m.mouthRadius || creature.radius * 0.32;
    ctx.save();
    ctx.translate(Math.cos(facing) * dist, Math.sin(facing) * dist);
    ctx.rotate(facing);
    const open = 0.72 + Math.sin(creature.pulse * 2.4 + mi) * 0.22;
    ctx.beginPath();
    ctx.fillStyle = "rgba(3,16,22,0.7)";
    ctx.strokeStyle = creature.bigMouth || creature.role === "hunter" ? "#ffc14a" : "#e8c27a";
    ctx.lineWidth = creature.bigMouth ? 1.8 : 1.2;
    ctx.ellipse(0, 0, r * open, r * (creature.bigMouth ? 0.68 : 0.55), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 核
  for (const n of creature.nuclei || []) {
    if (!n.alive) continue;
    const c = Math.cos(creature.angle);
    const s = Math.sin(creature.angle);
    const nx = n.ox * c - n.oy * s;
    const ny = n.ox * s + n.oy * c;
    ctx.beginPath();
    ctx.fillStyle = creature.coreColor || "#9be8d6";
    ctx.globalAlpha = 0.85;
    ctx.arc(nx, ny, n.r || 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function filteredEntries() {
  const q = state.query.trim().toLowerCase();
  return state.entries.filter((e) => {
    if (state.filter !== "all" && e.group !== state.filter) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.subtitle.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  });
}

function renderCardList() {
  const list = filteredEntries();
  els.cardList.innerHTML = "";
  for (const entry of list) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    if (entry.id === state.selectedId) card.classList.add("active");
    if (state.overrides[entry.id]) card.classList.add("dirty");
    card.dataset.id = entry.id;

    const canvas = document.createElement("canvas");
    const label = document.createElement("div");
    label.className = "label";
    label.innerHTML = `<strong>${entry.title}</strong>${entry.subtitle}`;
    card.append(canvas, label);
    card.addEventListener("click", () => selectEntry(entry.id));
    els.cardList.appendChild(card);

    let renderer = thumbRenderers.get(entry.id);
    if (!renderer) {
      renderer = new Renderer(canvas);
      thumbRenderers.set(entry.id, renderer);
    } else {
      renderer.canvas = canvas;
      renderer.ctx = canvas.getContext("2d", { alpha: false });
    }
    resizeCanvas(canvas, renderer, 120, 88);
    const creature = resolvedCreature(entry);
    creature.pulse = stageRenderer.time * 2 + (entry.id.length % 7);
    paintCreature(renderer, creature, 120, 88, { scale: 120 / (creature.radius * 4.6) });
  }
}

function selectEntry(id) {
  state.selectedId = id;
  renderCardList();
  renderEditor();
  paintStage();
}

function selectedEntry() {
  return state.entries.find((e) => e.id === state.selectedId) || null;
}

function renderEditor() {
  const entry = selectedEntry();
  els.editFields.innerHTML = "";
  if (!entry) {
    els.previewTitle.textContent = "选择一个生物";
    els.previewMeta.textContent = "左侧图鉴点击条目开始调整";
    return;
  }
  const creature = resolvedCreature(entry);
  els.previewTitle.textContent = entry.title;
  els.previewMeta.textContent = `${entry.subtitle} · ${entry.id}`;

  for (const def of FIELD_DEFS) {
    // 按形态隐藏无关项（仍可编辑通用色/半径）
    if (!fieldRelevant(def.key, creature.morph) && !["morph", "radius", "complexity", "color", "coreColor", "membrane", "bigMouth"].includes(def.key)) {
      continue;
    }
    const wrap = document.createElement("div");
    wrap.className = "field" + (def.type === "bool" ? " bool" : "");
    const label = document.createElement("label");
    label.textContent = def.label;
    wrap.appendChild(label);

    const value = creature[def.key];

    if (def.type === "range") {
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = String(value ?? def.min);
      const input = document.createElement("input");
      input.type = "range";
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = value ?? def.min;
      input.addEventListener("input", () => {
        const n = Number(input.value);
        val.textContent = String(n);
        setOverride(entry.id, def.key, n);
      });
      wrap.append(val, input);
    } else if (def.type === "bool") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!value;
      input.addEventListener("change", () => setOverride(entry.id, def.key, input.checked));
      wrap.appendChild(input);
    } else if (def.type === "color") {
      const input = document.createElement("input");
      input.type = "color";
      input.value = normalizeHex(value || "#3ecfb0");
      input.addEventListener("input", () => setOverride(entry.id, def.key, input.value));
      wrap.appendChild(input);
    } else if (def.type === "morph") {
      const select = document.createElement("select");
      for (const m of Object.values(MORPH)) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = `${MORPH_LABELS[m] || m} (${m})`;
        if (m === value) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => setOverride(entry.id, def.key, select.value));
      wrap.appendChild(select);
    }

    els.editFields.appendChild(wrap);
  }

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "0.4rem";
  actions.style.marginTop = "0.4rem";
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "重置此项";
  resetBtn.className = "danger";
  resetBtn.addEventListener("click", () => {
    delete state.overrides[entry.id];
    saveOverrides();
    renderCardList();
    renderEditor();
    paintStage();
    toast("已重置该项");
  });
  actions.appendChild(resetBtn);
  els.editFields.appendChild(actions);
}

function fieldRelevant(key, morph) {
  const map = {
    [MORPH.BACILLUS]: ["aspect", "curve", "thin", "chain", "flagella", "organelles", "membraneLayers", "vacuoles"],
    [MORPH.SPIRILLUM]: ["aspect", "thin", "flagella"],
    [MORPH.COCCUS]: ["aspect", "lobed", "elongate", "facets", "cilia", "organelles", "membraneLayers", "vacuoles"],
    [MORPH.COLONY]: ["colonyCells", "hollow", "cellBridges", "cilia", "organelles", "membraneLayers", "vacuoles"],
    [MORPH.VIRUS]: ["spikes", "capsidFacets", "organelles", "membraneLayers", "vacuoles"],
    [MORPH.PHAGE]: ["legs", "complexity", "organelles"],
  };
  return (map[morph] || []).includes(key);
}

function normalizeHex(c) {
  if (!c || typeof c !== "string") return "#3ecfb0";
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }
  return "#3ecfb0";
}

function setOverride(entryId, key, value) {
  if (!state.overrides[entryId]) state.overrides[entryId] = {};
  state.overrides[entryId][key] = value;
  // tint 同步：species 导出用
  if (key === "color") {
    const entry = state.entries.find((e) => e.id === entryId);
    if (entry?.syncTarget?.type === "SPECIES") {
      state.overrides[entryId].tint = value;
    }
  }
  saveOverrides();
  renderCardList();
  paintStage();
}

function paintStage() {
  const entry = selectedEntry();
  const rect = els.stage.getBoundingClientRect();
  const w = Math.max(280, rect.width);
  const h = Math.max(280, rect.height);
  resizeCanvas(els.stage, stageRenderer, w, h);
  if (!entry) {
    stageRenderer.ctx.fillStyle = "#041820";
    stageRenderer.ctx.fillRect(0, 0, w, h);
    return;
  }
  const creature = resolvedCreature(entry);
  if (state.spinning) {
    creature.angle = stageRenderer.time * 0.35;
    creature.pulse = stageRenderer.time * 2.2;
  }
  paintCreature(stageRenderer, creature, w, h);
}

function buildExportPayload() {
  const species = {};
  const evolutions = {};
  const hunter = {};
  const misc = {};

  for (const [id, patch] of Object.entries(state.overrides)) {
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) {
      misc[id] = patch;
      continue;
    }
    if (entry.syncTarget?.type === "SPECIES") {
      const clean = {};
      for (const k of SPECIES_SYNC_KEYS) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      }
      // morph 必须保留字符串
      if (patch.morph) clean.morph = patch.morph;
      if (Object.keys(clean).length) species[entry.syncTarget.id] = clean;
    } else if (entry.syncTarget?.type === "EVOLUTION") {
      evolutions[entry.syncTarget.id] = { ...patch };
    } else if (entry.syncTarget?.type === "HUNTER") {
      hunter[entry.syncTarget.id] = { ...patch };
    } else {
      misc[id] = { title: entry.title, patch };
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    species,
    evolutions,
    hunter,
    misc,
    overrides: state.overrides,
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制到剪贴板");
  } catch {
    toast("复制失败，请手动全选");
  }
}

function speciesPatchAsJs(speciesPatches) {
  const lines = ["// 粘贴到 SPECIES 对应条目中的字段补丁", "export const SPECIES_LOOK_PATCHES = {"];
  for (const [id, patch] of Object.entries(speciesPatches)) {
    lines.push(`  ${id}: ${JSON.stringify(patch, null, 4).replace(/\n/g, "\n  ")},`);
  }
  lines.push("};");
  return lines.join("\n");
}

function bindUi() {
  els.filters.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    state.filter = btn.dataset.filter;
    els.filters.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    renderCardList();
  });

  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    renderCardList();
  });

  document.getElementById("btn-spin").addEventListener("click", () => {
    state.spinning = !state.spinning;
    document.getElementById("btn-spin").textContent = state.spinning ? "暂停旋转" : "继续旋转";
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    const payload = buildExportPayload();
    downloadJson("creature-looks.json", payload);
    toast("已导出 creature-looks.json");
  });

  document.getElementById("btn-copy-species").addEventListener("click", () => {
    const payload = buildExportPayload();
    copyText(speciesPatchAsJs(payload.species));
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("清除所有本地外观调整？")) return;
    state.overrides = {};
    saveOverrides();
    renderCardList();
    renderEditor();
    paintStage();
    toast("已清除本地调整");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      state.overrides = data.overrides || {};
      // 兼容仅 species 字段的文件
      if (data.species && !data.overrides) {
        for (const [id, patch] of Object.entries(data.species)) {
          state.overrides[`species:${id}`] = patch;
        }
      }
      saveOverrides();
      renderCardList();
      renderEditor();
      paintStage();
      toast("已导入外观调整");
    } catch (err) {
      console.error(err);
      toast("导入失败：JSON 无效");
    }
    e.target.value = "";
  });
}

function loop() {
  stageRenderer.time += 0.016;
  paintStage();
  // 缩略图低频刷新，保持鞭毛等动效
  if ((loop._tick = (loop._tick || 0) + 1) % 8 === 0) {
    renderCardListThumbsOnly();
  }
  requestAnimationFrame(loop);
}

function renderCardListThumbsOnly() {
  const cards = els.cardList.querySelectorAll(".card");
  for (const card of cards) {
    const id = card.dataset.id;
    const entry = state.entries.find((e) => e.id === id);
    const canvas = card.querySelector("canvas");
    const renderer = thumbRenderers.get(id);
    if (!entry || !canvas || !renderer) continue;
    const creature = resolvedCreature(entry);
    creature.pulse = stageRenderer.time * 2 + (id.length % 7);
    if (state.spinning) creature.angle = stageRenderer.time * 0.25 + (id.length % 5);
    paintCreature(renderer, creature, 120, 88, { scale: 120 / (creature.radius * 4.6) });
  }
}

function init() {
  state.entries = buildEntries();
  bindUi();
  renderCardList();
  if (state.entries[0]) selectEntry(state.entries[0].id);
  window.addEventListener("resize", () => paintStage());
  requestAnimationFrame(loop);
}

init();
