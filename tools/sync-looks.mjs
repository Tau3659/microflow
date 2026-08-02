#!/usr/bin/env node
/**
 * 将 tools/creature-looks.json 中的外观补丁写回 js/config.js（SPECIES）
 * 以及 js/creature.js 中 createHunter 的默认外观字段（若存在 hunter.mouthling）
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
];

function fail(msg) {
  console.error(`[sync-looks] ${msg}`);
  process.exit(1);
}

function formatValue(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return JSON.stringify(v);
}

/** 在 SPECIES 对象文本中定位某个 id 的 { ... } 块 */
function findSpeciesBlock(src, id) {
  const marker = `${id}:`;
  const startKey = src.indexOf(marker);
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

function upsertField(blockText, key, value) {
  const re = new RegExp(`(^|\\n)([ \\t]*)${key}:\\s*[^,\\n]+,?`);
  const line = `${key}: ${formatValue(value)},`;
  if (re.test(blockText)) {
    return blockText.replace(re, `$1$2${line}`);
  }
  // 插入到 id 行后或首字段后
  const idLine = blockText.match(/id:\s*"[^"]+",?/);
  if (idLine) {
    return blockText.replace(idLine[0], `${idLine[0]}\n    ${line}`);
  }
  return blockText.replace(/\{\s*/, `{\n    ${line}\n    `);
}

function applySpeciesPatches(configSrc, speciesPatches) {
  let out = configSrc;
  const applied = [];
  for (const [id, patch] of Object.entries(speciesPatches || {})) {
    const block = findSpeciesBlock(out, id);
    if (!block) {
      console.warn(`[sync-looks] 跳过未知 SPECIES: ${id}`);
      continue;
    }
    let text = block.text;
    for (const key of SPECIES_KEYS) {
      if (patch[key] === undefined) continue;
      text = upsertField(text, key, patch[key]);
    }
    // morph 若写的是 bacillus 等字符串，保持；若误写常量名则原样写入字符串
    out = out.slice(0, block.start) + text + out.slice(block.end);
    applied.push(id);
  }
  return { out, applied };
}

function applyHunterPatch(creatureSrc, hunterPatch) {
  if (!hunterPatch || !Object.keys(hunterPatch).length) {
    return { out: creatureSrc, applied: false };
  }
  let out = creatureSrc;
  const map = {
    radius: /radius:\s*SCALE\.npc\s*\*\s*[0-9.]+/,
    curve: /curve:\s*species\.curve\s*\|\|\s*[0-9.]+/,
    aspect: /aspect:\s*species\.aspect\s*\|\|\s*[0-9.]+/,
    flagella: /flagella:\s*[0-9]+,/,
  };
  // 更稳妥：替换 createHunter 内的字面默认
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
    // radius: SCALE.npc * 0.72  → 保持比例写法若接近 npc 比例
    const ratio = hunterPatch.radius / 20;
    out = out.replace(
      /(createHunter[\s\S]*?radius:\s*SCALE\.npc\s*\*\s*)([0-9.]+)/,
      `$1${Number(ratio.toFixed(3))}`
    );
  }
  // mouthling SPECIES 已由 species 补丁覆盖时足够
  return { out, applied: true };
}

function main() {
  if (!fs.existsSync(looksPath)) {
    fail(`找不到 ${looksPath}\n请先在图鉴页导出 JSON，保存为 tools/creature-looks.json`);
  }
  const looks = JSON.parse(fs.readFileSync(looksPath, "utf8"));
  const configSrc = fs.readFileSync(configPath, "utf8");
  const creatureSrc = fs.readFileSync(creaturePath, "utf8");

  const { out: nextConfig, applied } = applySpeciesPatches(configSrc, looks.species || {});
  if (nextConfig !== configSrc) {
    fs.writeFileSync(configPath, nextConfig);
    console.log(`[sync-looks] 已更新 SPECIES: ${applied.join(", ") || "(无)"}`);
  } else {
    console.log("[sync-looks] SPECIES 无变更");
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
