/** 外形：杆菌 / 球菌 / 螺旋菌 / 多细胞集群 / 囊膜病毒 / 噬菌体 */
export const MORPH = {
  BACILLUS: "bacillus",
  COCCUS: "coccus",
  SPIRILLUM: "spirillum",
  COLONY: "colony",
  VIRUS: "virus",
  PHAGE: "phage",
};

/**
 * 屏幕体型比例基本固定：升级/深层靠结构复杂度，不靠体积膨胀
 */
export const SCALE = {
  player: [22, 23, 24, 25, 25],
  npc: 20,
  boss: 34,
  ghost: 22,
};

/** 进化形态：原核 → 真核单细胞 → 多细胞 → 复杂多细胞 → 病毒聚合体
 *  半径几乎恒定；complexity / 核 / 节 / 刺突等随级升高
 */
export const EVOLUTIONS = [
  {
    id: 0,
    name: "原核细胞",
    morph: MORPH.BACILLUS,
    radius: SCALE.player[0],
    segmentCount: 3,
    nuclei: 1,
    color: "#3ecfb0",
    coreColor: "#9be8d6",
    membrane: "#1a6b62",
    pointsToEvolve: 12,
    complexity: 1,
    mouths: 1,
    flagella: 1,
    organelles: 0,
    membraneLayers: 1,
  },
  {
    id: 1,
    name: "真核单细胞",
    morph: MORPH.COCCUS,
    radius: SCALE.player[1],
    segmentCount: 5,
    nuclei: 2,
    color: "#5ec4c8",
    coreColor: "#b8f0ef",
    membrane: "#2a6f78",
    pointsToEvolve: 28,
    complexity: 2,
    mouths: 1,
    flagella: 0,
    cilia: true,
    organelles: 2,
    membraneLayers: 1,
    vacuoles: 1,
  },
  {
    id: 2,
    name: "原始多细胞",
    morph: MORPH.COLONY,
    radius: SCALE.player[2],
    segmentCount: 7,
    nuclei: 3,
    color: "#e8c27a",
    coreColor: "#ffe6a8",
    membrane: "#8a6a3a",
    pointsToEvolve: 48,
    complexity: 3,
    mouths: 1,
    flagella: 0,
    colonyCells: 6,
    organelles: 3,
    membraneLayers: 2,
    vacuoles: 2,
    cellBridges: true,
  },
  {
    id: 3,
    name: "复杂多细胞",
    morph: MORPH.COLONY,
    radius: SCALE.player[3],
    segmentCount: 9,
    nuclei: 4,
    color: "#7eb6ff",
    coreColor: "#d4e7ff",
    membrane: "#3a5a8a",
    pointsToEvolve: 72,
    complexity: 4,
    mouths: 1,
    flagella: 0,
    colonyCells: 9,
    organelles: 5,
    membraneLayers: 2,
    vacuoles: 3,
    cellBridges: true,
    cilia: true,
  },
  {
    id: 4,
    name: "病毒聚合体",
    morph: MORPH.VIRUS,
    radius: SCALE.player[4],
    segmentCount: 11,
    nuclei: 5,
    color: "#e07a6a",
    coreColor: "#ffc4bc",
    membrane: "#8a3a3a",
    pointsToEvolve: Infinity,
    complexity: 5,
    mouths: 1,
    spikes: 14,
    organelles: 6,
    membraneLayers: 3,
    vacuoles: 2,
    capsidFacets: 8,
  },
];

/**
 * 稀有生物能力（参照真实微生物结构/功能）
 * dropRate 为单次击杀掉落基础概率，达 maxStacks 后不再掉落
 */
export const ABILITIES = {
  flagella: {
    id: "flagella",
    name: "鞭毛",
    maxStacks: 5,
    dropRate: 0.09,
    color: "#7dffd0",
    minLayer: 0,
  },
  cilia: {
    id: "cilia",
    name: "纤毛",
    maxStacks: 4,
    dropRate: 0.08,
    color: "#b8f0ef",
    minLayer: 1,
  },
  cellWall: {
    id: "cellWall",
    name: "细胞壁",
    maxStacks: 3,
    dropRate: 0.075,
    color: "#c9e8a0",
    minLayer: 0,
  },
  buccal: {
    id: "buccal",
    name: "胞口",
    maxStacks: 4,
    dropRate: 0.075,
    color: "#e8c27a",
    minLayer: 1,
  },
  capsule: {
    id: "capsule",
    name: "荚膜",
    maxStacks: 3,
    dropRate: 0.065,
    color: "#a8d4ff",
    minLayer: 0,
  },
  gasVacuole: {
    id: "gasVacuole",
    name: "气泡",
    maxStacks: 3,
    dropRate: 0.06,
    color: "#d4f0ff",
    minLayer: 0,
  },
  chromatophore: {
    id: "chromatophore",
    name: "载色体",
    maxStacks: 2,
    dropRate: 0.05,
    color: "#9be87a",
    minLayer: 1,
  },
  spikeProtein: {
    id: "spikeProtein",
    name: "刺突",
    maxStacks: 3,
    dropRate: 0.07,
    color: "#e07a6a",
    minLayer: 3,
  },
  plasmid: {
    id: "plasmid",
    name: "质粒",
    maxStacks: 2,
    dropRate: 0.04,
    color: "#f0d7a0",
    minLayer: 0,
  },
  endospore: {
    id: "endospore",
    name: "芽孢",
    maxStacks: 2,
    dropRate: 0.035,
    color: "#e8e0c8",
    minLayer: 0,
  },
};

/** 真实微生物参考种：各层外观差异 */
export const SPECIES = {
  ecoli: {
    id: "ecoli",
    morph: MORPH.BACILLUS,
    flagella: 2,
    curve: 0,
    aspect: 2.35,
  },
  vibrio: {
    id: "vibrio",
    morph: MORPH.BACILLUS,
    flagella: 1,
    curve: 0.55,
    aspect: 2.1,
  },
  spirillum: {
    id: "spirillum",
    morph: MORPH.SPIRILLUM,
    flagella: 2,
    curve: 0,
    aspect: 2.8,
  },
  cyanobacteria: {
    id: "cyanobacteria",
    morph: MORPH.BACILLUS,
    flagella: 0,
    curve: 0,
    aspect: 2.6,
    chain: true,
    tint: "#4ecf9a",
  },
  amoeba: {
    id: "amoeba",
    morph: MORPH.COCCUS,
    cilia: false,
    lobed: true,
    aspect: 1.15,
  },
  paramecium: {
    id: "paramecium",
    morph: MORPH.COCCUS,
    cilia: true,
    elongate: true,
    aspect: 1.55,
  },
  euglena: {
    id: "euglena",
    morph: MORPH.SPIRILLUM,
    flagella: 1,
    chromatophore: true,
    aspect: 2.2,
  },
  diatom: {
    id: "diatom",
    morph: MORPH.COCCUS,
    facets: 6,
    aspect: 1.05,
    tint: "#8fd0c8",
  },
  volvox: {
    id: "volvox",
    morph: MORPH.COLONY,
    colonyCells: 9,
    cellBridges: true,
    hollow: true,
  },
  choano: {
    id: "choano",
    morph: MORPH.COLONY,
    colonyCells: 5,
    collar: true,
  },
  budding: {
    id: "budding",
    morph: MORPH.COLONY,
    colonyCells: 7,
    budding: true,
  },
  adenovirus: {
    id: "adenovirus",
    morph: MORPH.VIRUS,
    spikes: 12,
    capsidFacets: 8,
  },
  influenza: {
    id: "influenza",
    morph: MORPH.VIRUS,
    spikes: 16,
    envelope: true,
  },
  t4phage: {
    id: "t4phage",
    morph: MORPH.PHAGE,
    legs: 3,
  },
  filamentPhage: {
    id: "filamentPhage",
    morph: MORPH.SPIRILLUM,
    flagella: 0,
    thin: true,
    aspect: 3.2,
    tint: "#c4a0ff",
  },
};

/** 无限流主题循环模板（深度加深时颜色变暗、结构更复杂） */
const LAYER_THEMES = [
  {
    name: "原核海域",
    bgTop: "#12505c",
    bgBottom: "#041820",
    accent: "#3ecfb0",
    protein: "#9be8d6",
    dna: "#e8c27a",
    morphPool: [MORPH.BACILLUS, MORPH.BACILLUS, MORPH.SPIRILLUM],
    speciesPool: ["ecoli", "vibrio", "spirillum", "cyanobacteria", "ecoli"],
    boss: {
      name: "裂殖霸主",
      morph: MORPH.BACILLUS,
      species: "ecoli",
      color: "#c45c5c",
      membrane: "#6a2a2a",
      flagella: 4,
    },
  },
  {
    name: "单细胞带",
    bgTop: "#0a3540",
    bgBottom: "#020f14",
    accent: "#5ec4c8",
    protein: "#7fd4d8",
    dna: "#f0d7a0",
    morphPool: [MORPH.COCCUS, MORPH.SPIRILLUM, MORPH.COCCUS],
    speciesPool: ["amoeba", "paramecium", "euglena", "diatom", "paramecium"],
    boss: {
      name: "纤毛暴君",
      morph: MORPH.COCCUS,
      species: "paramecium",
      color: "#b85c7a",
      membrane: "#6a2a48",
      cilia: true,
    },
  },
  {
    name: "多细胞礁",
    bgTop: "#061820",
    bgBottom: "#01070a",
    accent: "#e8c27a",
    protein: "#f0d7a0",
    dna: "#7eb6ff",
    morphPool: [MORPH.COLONY, MORPH.COCCUS, MORPH.COLONY],
    speciesPool: ["volvox", "choano", "budding", "volvox", "amoeba"],
    boss: {
      name: "群核巨兽",
      morph: MORPH.COLONY,
      species: "volvox",
      color: "#8a6ad1",
      membrane: "#3a2a6a",
      colonyCells: 8,
    },
  },
  {
    name: "病毒风暴",
    bgTop: "#040c14",
    bgBottom: "#000408",
    accent: "#7eb6ff",
    protein: "#a8ceff",
    dna: "#e07a6a",
    morphPool: [MORPH.VIRUS, MORPH.PHAGE, MORPH.VIRUS],
    speciesPool: ["adenovirus", "influenza", "t4phage", "filamentPhage", "adenovirus"],
    boss: {
      name: "噬界母体",
      morph: MORPH.PHAGE,
      species: "t4phage",
      color: "#e07a6a",
      membrane: "#6a2020",
      spikes: 12,
    },
  },
];

function clampByte(n) {
  return Math.max(0, Math.min(255, n | 0));
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

/** 深度越深，色调略压暗 */
function deepenColor(hex, depth) {
  const { r, g, b } = hexToRgb(hex);
  const t = Math.min(0.55, depth * 0.035);
  return rgbToHex(r * (1 - t), g * (1 - t), b * (1 - t * 0.9));
}

/**
 * 无限层：任意 depth >= 0 均可生成
 * 体型固定；结构（核/刺/鞭毛/集群）随深度变复杂
 */
export function getLayer(depth = 0) {
  const index = Math.max(0, depth | 0);
  const theme = LAYER_THEMES[index % LAYER_THEMES.length];
  const cycle = Math.floor(index / LAYER_THEMES.length);
  const complexity = 1 + index + cycle;
  // 第 0 层普通怪全被动；之后攻击性缓增
  const hostile =
    index === 0 ? 0 : Math.min(0.32, 0.08 + index * 0.025 + cycle * 0.02);
  const skittish = index === 0 ? 0 : Math.min(0.4, 0.28 + index * 0.01);
  const passive = Math.max(0.2, 1 - hostile - skittish);
  const maxHostileNormals =
    index === 0 ? 0 : Math.min(6, 1 + Math.floor(index / 2) + cycle);
  const bossBase = theme.boss;
  const bossNuclei = Math.min(8, 2 + Math.floor(complexity / 2));
  const boss = {
    ...bossBase,
    name: cycle > 0 ? `${bossBase.name}·${cycle + 1}` : bossBase.name,
    radius: SCALE.boss,
    nuclei: bossNuclei,
    flagella: Math.min(8, (bossBase.flagella || 0) + Math.floor(complexity / 3)),
    spikes: Math.min(24, (bossBase.spikes || 0) + complexity + cycle * 2),
    colonyCells: Math.min(
      16,
      (bossBase.colonyCells || 0) + Math.floor(complexity / 2) + cycle
    ),
    cilia: !!bossBase.cilia || complexity >= 4,
  };

  // 混入更深主题物种，随轮次丰富
  let speciesPool = [...theme.speciesPool];
  if (cycle > 0) {
    const extra = LAYER_THEMES[(index + 1) % LAYER_THEMES.length].speciesPool;
    speciesPool = speciesPool.concat(extra.slice(0, 2 + Math.min(3, cycle)));
  }

  return {
    id: index,
    name: cycle > 0 ? `${theme.name} ${cycle + 1}` : theme.name,
    bgTop: deepenColor(theme.bgTop, index),
    bgBottom: deepenColor(theme.bgBottom, index + 2),
    accent: theme.accent,
    protein: theme.protein,
    dna: theme.dna,
    proteinCount: Math.max(22, 44 - Math.min(18, index * 2)),
    dnaCount: Math.min(12, 6 + Math.floor(index / 2)),
    normalCount: Math.min(22, 10 + Math.floor(index * 1.2) + cycle),
    temperWeights: { passive, hostile, skittish },
    maxHostileNormals,
    requiredEvolution: Math.min(EVOLUTIONS.length - 1, Math.floor(index / 2)),
    morphPool: theme.morphPool,
    speciesPool,
    complexity,
    cycle,
    boss,
  };
}

/** 兼容旧引用：前若干主题快照（无限流请用 getLayer） */
export const LAYERS = Array.from({ length: 4 }, (_, i) => getLayer(i));

export const WORLD = {
  width: 2600,
  height: 2600,
};

/** 性情：被动 / 固有攻击 / 被激怒后攻击 */
export const TEMPER = {
  PASSIVE: "passive",
  HOSTILE: "hostile",
  SKITTISH: "skittish",
};

/** 攻击性警告色（高对比警示） */
export const WARNING = {
  color: "#ff5a3c",
  membrane: "#8a2418",
  core: "#ffd2a8",
  stripe: "#ffc14a",
  calmPassive: "#7dceb8",
  calmSkittish: "#c9b86a",
};

/** 视差：下一层更慢，相对位移体现速度感 */
export const PARALLAX = {
  deep: 0.22,
  ghost: 0.42,
  mid: 0.68,
  current: 1,
};

/** 玩家品牌色：升级只变形态/体型，颜色始终一致 */
export const PLAYER_LOOK = {
  color: "#3ecfb0",
  coreColor: "#9be8d6",
  membrane: "#1a6b62",
};

export const PLAYER = {
  baseSpeed: 120,
  boostSpeed: 210,
  /** 相对玩家常速，其他生物速度上限（略慢以便追逐/逃脱） */
  npcSpeedFactor: 0.86,
  bossSpeedFactor: 0.9,
  /** 满能量可按住加速的时长；随进化提升 */
  boostDuration: 0.85,
  boostDurationPerEvo: 0.28,
  /** 加速能量从空回复满所需秒数 */
  boostRegenTime: 1.85,
  turnRate: 9,
  segmentSpacing: 11,
  /** 体型越大移动越慢：相对此参考半径缩放速度 */
  speedRefRadius: 18,
  minSpeedScale: 0.55,
  maxSpeedScale: 1.12,
  /** 核半径相对体半径比例；升级只改体半径，核随之等比放大 */
  nucleusRadiusFactor: 0.36,
  mouthDistFactor: 0.95,
  mouthRadiusFactor: 0.32,
  eatRangeBonus: 2,
  nucleusHurtCooldown: 0.9,
  /** 缺失细胞核时，吞噬这么多蛋白质可恢复 1 个核 */
  proteinPerNucleus: 7,
  /** 进化过渡时长（成长感） */
  evolveDuration: 2.35,
};

/** Boss 领地 */
export const BOSS_AI = {
  territoryRadius: 460,
  aggroRadius: 300,
  leashRadius: 520,
  returnSpeed: 1.15,
};
