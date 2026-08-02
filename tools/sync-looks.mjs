#!/usr/bin/env node
/**
 * 将 tools/creature-looks.json 中的外观补丁写回游戏代码：
 * - js/config.js → SPECIES / EVO_BASE / LAYER_THEMES[].boss
 * - js/creature.js → createHunter 默认外观（若有 hunter 补丁）
 *
 * 用法：
 *   npm run sync:looks
 *   node tools/sync-looks.mjs [path/to/creature-looks.json]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const looksPath = path.resolve(process.argv[2] || path.join(__dirname, "creature-looks.json"));
const configPath = path.join(root, "js/config.js");
const creaturePath = path.join(root, "js/creature.js");

const SPECIES_KEYS = [
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
  "collar",
  "budding",
  "envelope",
  "chromatophore",
];

const EVO_KEYS = [
  "morph",
  "radius",
  "complexity",
  "flagella",
  "spikes",
  "colonyCells",
  "cilia",
  "cellBridges",
  "capsidFacets",
  "organelles",
  "membraneLayers",
  "vacuoles",
  "legs",
  "color",
  "coreColor",
  "membrane",
];

const BOSS_KEYS = [
  "morph",
  "color",
  "membrane",
  "flagella",
  "spikes",
  "colonyCells",
  "cilia",
  "radius",
];

function fail(msg) {
  console.error(`[sync-looks] ${msg}`);
  process.exit(1);
}

function formatValue(v) {
  if (typeof v === "string") {
    // morph 写成 MORPH.XXX 常量引用
    const morphMap = {
      bacillus: "MORPH.BACILLUS",
      coccus: "MORPH.COCCUS",
      spirillum: "MORPH.SPIRILLUM",
      colony: "MORPH.COLONY",
      virus: "MORPH.VIRUS",
      phage: "MORPH.PHAGE",
    };
    if (morphMap[v]) return morphMap[v];
    return JSON.stringify(v);
  }
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** 在源码中定位某个标识后的平衡花括号块 */
function findBlockAfter(src, marker, fromIndex = 0) {
  const startKey = src.indexOf(marker, fromIndex);
  if (startKey < 0) return null;
  const braceStart = src.indexOf("{", startKey);
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start: braceStart, end: i + 1, text: src.slice(braceStart, i + 1) };
      }
    }
  }
  return null;
}

function findSpeciesBlock(src, id) {
  // 限定在 SPECIES 对象内，避免误匹配 speciesPool 等
  const speciesStart = src.indexOf("export const SPECIES = {");
  if (speciesStart < 0) return null;
  const speciesEnd = src.indexOf("\n};", speciesStart);
  const slice = src.slice(speciesStart, speciesEnd > 0 ? speciesEnd + 3 : undefined);
  const local = findBlockAfter(slice, `\n  ${id}:`);
  if (!local) return null;
  return {
    start: speciesStart + local.start,
    end: speciesStart + local.end,
    text: local.text,
  };
}

function findEvoBaseBlock(src, evoId) {
  const arrStart = src.indexOf("const EVO_BASE = [");
  if (arrStart < 0) return null;
  const arrEnd = src.indexOf("\n];", arrStart);
  const slice = src.slice(arrStart, arrEnd > 0 ? arrEnd + 3 : undefined);
  const marker = `id: ${Number(evoId)},`;
  const idPos = slice.indexOf(marker);
  if (idPos < 0) return null;
  // 回退到该对象的 {
  let braceStart = -1;
  for (let i = idPos; i >= 0; i -= 1) {
    if (slice[i] === "{") {
      braceStart = i;
      break;
    }
  }
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < slice.length; i += 1) {
    if (slice[i] === "{") depth += 1;
    else if (slice[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: arrStart + braceStart,
          end: arrStart + i + 1,
          text: slice.slice(braceStart, i + 1),
        };
      }
    }
  }
  return null;
}

function findBossThemeBlock(src, themeIndex) {
  const themesStart = src.indexOf("const LAYER_THEMES = [");
  if (themesStart < 0) return null;
  const themesEnd = src.indexOf("\n];", themesStart);
  const slice = src.slice(themesStart, themesEnd > 0 ? themesEnd + 3 : undefined);

  // 数组内 depth===0 的 {…} 即一个主题；取其 boss: { … }
  let depth = 0;
  let themeCount = -1;
  let themeStart = -1;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (ch === "{") {
      if (depth === 0) {
        themeCount += 1;
        themeStart = i;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && themeCount === Number(themeIndex) && themeStart >= 0) {
        const themeText = slice.slice(themeStart, i + 1);
        const bossLocal = findBlockAfter(themeText, "boss:");
        if (!bossLocal) return null;
        return {
          start: themesStart + themeStart + bossLocal.start,
          end: themesStart + themeStart + bossLocal.end,
          text: bossLocal.text,
        };
      }
    }
  }
  return null;
}

function upsertField(blockText, key, value) {
  const re = new RegExp(`(^|\\n)([ \\t]*)${key}:\\s*[^,\\n]+,?`);
  const line = `${key}: ${formatValue(value)},`;
  if (re.test(blockText)) {
    return blockText.replace(re, `$1$2${line}`);
  }
  const idLine = blockText.match(/id:\s*(?:"[^"]+"|\d+),?/);
  if (idLine) {
    return blockText.replace(idLine[0], `${idLine[0]}\n    ${line}`);
  }
  const nameLine = blockText.match(/name:\s*"[^"]+",?/);
  if (nameLine) {
    return blockText.replace(nameLine[0], `${nameLine[0]}\n      ${line}`);
  }
  return blockText.replace(/\{\s*/, `{\n    ${line}\n    `);
}

function applyKeyedPatches(src, patches, keys, finder, label) {
  let out = src;
  const applied = [];
  for (const [id, patch] of Object.entries(patches || {})) {
    const block = finder(out, id);
    if (!block) {
      console.warn(`[sync-looks] 跳过未知 ${label}: ${id}`);
      continue;
    }
    let text = block.text;
    for (const key of keys) {
      if (patch[key] === undefined) continue;
      text = upsertField(text, key, patch[key]);
    }
    out = out.slice(0, block.start) + text + out.slice(block.end);
    applied.push(String(id));
  }
  return { out, applied };
}

function applyHunterPatch(creatureSrc, hunterPatch) {
  if (!hunterPatch || !Object.keys(hunterPatch).length) {
    return { out: creatureSrc, applied: false };
  }
  let out = creatureSrc;
  if (typeof hunterPatch.curve === "number") {
    out = out.replace(
      /(createHunter[\s\S]*?curve:\s*species\.curve\s*\|\|\s*)([0-9.]+)/,
      `$1${hunterPatch.curve}`
    );
  }
  if (typeof hunterPatch.aspect === "number") {
    out = out.replace(
      /(createHunter[\s\S]*?aspect:\s*species\.aspect\s*\|\|\s*)([0-9.]+)/,
      `$1${hunterPatch.aspect}`
    );
  }
  if (typeof hunterPatch.flagella === "number") {
    out = out.replace(
      /(createHunter[\s\S]*?flagella:\s*)([0-9]+)(,)/,
      `$1${hunterPatch.flagella}$3`
    );
  }
  if (typeof hunterPatch.radius === "number") {
    const ratio = hunterPatch.radius / 20;
    out = out.replace(
      /(createHunter[\s\S]*?radius:\s*SCALE\.npc\s*\*\s*)([0-9.]+)/,
      `$1${Number(ratio.toFixed(3))}`
    );
  }
  return { out, applied: true };
}

function main() {
  if (!fs.existsSync(looksPath)) {
    fail(`找不到 ${looksPath}\n请先在图鉴页导出 JSON，保存为 tools/creature-looks.json`);
  }
  const looks = JSON.parse(fs.readFileSync(looksPath, "utf8"));
  let configSrc = fs.readFileSync(configPath, "utf8");
  const creatureSrc = fs.readFileSync(creaturePath, "utf8");
  const originalConfig = configSrc;

  const species = applyKeyedPatches(
    configSrc,
    looks.species || {},
    SPECIES_KEYS,
    findSpeciesBlock,
    "SPECIES"
  );
  configSrc = species.out;

  const evoPatches = looks.evolutions || {};
  const evo = applyKeyedPatches(configSrc, evoPatches, EVO_KEYS, findEvoBaseBlock, "EVO_BASE");
  configSrc = evo.out;

  // boss: { "0": {...}, "theme0": {...} } 或 bosses: [...]
  const bossRaw = looks.bosses || looks.boss || {};
  const bossNormalized = {};
  for (const [k, v] of Object.entries(bossRaw)) {
    const m = String(k).match(/(\d+)/);
    if (m) bossNormalized[m[1]] = v;
  }
  const boss = applyKeyedPatches(
    configSrc,
    bossNormalized,
    BOSS_KEYS,
    findBossThemeBlock,
    "LAYER_THEMES.boss"
  );
  configSrc = boss.out;

  if (configSrc !== originalConfig) {
    fs.writeFileSync(configPath, configSrc);
    if (species.applied.length) {
      console.log(`[sync-looks] 已更新 SPECIES: ${species.applied.join(", ")}`);
    }
    if (evo.applied.length) {
      console.log(`[sync-looks] 已更新 EVO_BASE: ${evo.applied.join(", ")}`);
    }
    if (boss.applied.length) {
      console.log(`[sync-looks] 已更新 Boss 主题: ${boss.applied.join(", ")}`);
    }
  } else {
    console.log("[sync-looks] config.js 无变更");
  }

  const hunterPatch = looks.hunter?.mouthling || looks.overrides?.["hunter:mouthling"];
  const { out: nextCreature, applied: hunterApplied } = applyHunterPatch(creatureSrc, hunterPatch);
  if (hunterApplied && nextCreature !== creatureSrc) {
    fs.writeFileSync(creaturePath, nextCreature);
    console.log("[sync-looks] 已更新 createHunter 默认外观");
  } else {
    console.log("[sync-looks] createHunter 无变更");
  }

  console.log("[sync-looks] 完成。请刷新游戏 / 图鉴预览确认效果。");
}

main();
