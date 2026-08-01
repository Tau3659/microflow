import { EVOLUTIONS, LAYERS, PLAYER } from "./config.js";
import {
  updatePlayer,
  updateEnemy,
  updateGhost,
  applyEvolution,
  restoreOneNucleus,
  provokeCreature,
  isAggressive,
  aliveNuclei,
  nucleusWorldPos,
  mouthWorldPos,
  mouthTouchesNucleus,
  mouthTouchesPoint,
  wrapEntity,
  wrappedOffset,
} from "./creature.js";
import {
  createLevel,
  spawnBurst,
  spawnFloatText,
  decomposeCreature,
  maintainPickups,
  ecosystemProtein,
} from "./world.js";
import { Renderer } from "./renderer.js";
import { Input } from "./input.js";

export class Game {
  constructor({ canvas, controlsRoot, hud, overlay }) {
    this.canvas = canvas;
    this.hud = hud;
    this.overlay = overlay;
    this.renderer = new Renderer(canvas);
    this.input = new Input(controlsRoot);
    this.level = null;
    this.camera = { x: 0, y: 0 };
    this.running = false;
    this.ended = false;
    this.raf = 0;
    this.last = 0;
    this.playerState = {
      evolutionId: 0,
      points: 0,
      evolvedThisLayer: false,
    };
    this.onStateChange = null;
  }

  init() {
    this.renderer.resize();
    this.input.bind();
    window.addEventListener("resize", () => this.renderer.resize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.renderer.resize(), 120);
    });
  }

  start(layerIndex = 0, resetProgress = true) {
    if (resetProgress) {
      this.playerState = { evolutionId: 0, points: 0, evolvedThisLayer: false };
    }
    this.level = createLevel(layerIndex, this.playerState);
    this.ended = false;
    this.running = true;
    this._centerCamera(true);
    this._updateHud();
    this.overlay.hide();
    this.hud.show();
    this.input.show();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this._loop(t));
    this.onStateChange?.("playing");
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.hide();
  }

  goHome() {
    this.stop();
    this.hud.hide();
    this.overlay.hide();
    this.onStateChange?.("title");
  }

  _centerCamera(hard = false) {
    const targetX = this.level.player.x - this.renderer.w * 0.5;
    const targetY = this.level.player.y - this.renderer.h * 0.48;
    if (hard) {
      this.camera.x = targetX;
      this.camera.y = targetY;
      return;
    }
    this.camera.x += (targetX - this.camera.x) * 0.14;
    this.camera.y += (targetY - this.camera.y) * 0.14;
  }

  _canEvolve() {
    const evo = EVOLUTIONS[this.level.player.evolutionId];
    return this.level.points >= evo.pointsToEvolve && evo.pointsToEvolve !== Infinity;
  }

  _portalOpen() {
    if (this.level.layerIndex >= LAYERS.length - 1) return false;
    // 进化后，或本层蛋白质吃光后，必须进入下一层
    return this.level.evolvedThisLayer || this.level.proteinsExhausted;
  }

  _updateHud() {
    const player = this.level.player;
    const evo = EVOLUTIONS[player.evolutionId];
    const need = evo.pointsToEvolve;
    const nucleiAlive = aliveNuclei(player).length;
    const missing = player.nuclei.length - nucleiAlive;
    this.hud.setInfo({
      layer: this.level.layer.name,
      form: evo.name,
      points: this.level.points,
      need: need === Infinity ? "MAX" : need,
      nuclei: nucleiAlive,
      nucleiMax: player.nuclei.length,
      proteinLeft: ecosystemProtein(this.level),
      proteinBudget: this.level.proteinBudget,
      recoverProgress: player.recoverProgress || 0,
      recoverNeed: PLAYER.proteinPerNucleus,
      recovering: missing > 0,
      exhausted: this.level.proteinsExhausted,
      canEvolve: this._canEvolve(),
      boostReady: player.boostCooldown <= 0 && player.boostTimer <= 0,
      boosting: player.boostTimer > 0,
    });
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this._update(dt);
    this.renderer.render(this.level, this.camera, this._canEvolve(), this._portalOpen());
    this.raf = requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    if (this.ended) return;
    const level = this.level;
    const player = level.player;

    updatePlayer(player, this.input, dt);
    const wrap = wrapEntity(player, level.world);
    // 环面穿越时同步相机，避免“撞墙感”
    this.camera.x += wrap.wx;
    this.camera.y += wrap.wy;

    for (const c of level.creatures) {
      updateEnemy(c, player, dt, level.world, level.proteins);
    }
    for (const g of level.ghosts || []) {
      updateGhost(g, dt, level.world);
    }

    this._collectPickups();
    this._npcEatProteins();
    this._checkProteinExhausted();
    this._resolveNucleusCombat();
    this._updateVfx(dt);
    this._updatePortal(dt);

    maintainPickups(level);
    this.playerState.points = level.points;
    this.playerState.evolutionId = player.evolutionId;
    this.playerState.evolvedThisLayer = level.evolvedThisLayer;
    this._centerCamera(false);
    this._updateHud();

    // 最终形态且击败最终 Boss
    if (
      level.layerIndex === LAYERS.length - 1 &&
      level.bossDefeated &&
      player.evolutionId >= EVOLUTIONS.length - 1
    ) {
      this._end("成为主宰", "你已从原核细胞演化至病毒聚合体，微观之海臣服于你。");
    }
  }

  _collectPickups() {
    const level = this.level;
    const player = level.player;
    const world = level.world;
    const mouth = mouthWorldPos(player);
    const missing = player.nuclei.length - aliveNuclei(player).length;

    for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
      const p = level.proteins[i];
      p.phase += 0.05;
      if (!mouthTouchesPoint(mouth, p.x, p.y, p.r, world, 1)) continue;

      level.proteins.splice(i, 1);
      level.proteinConsumed += p.value;
      spawnBurst(level, p.x, p.y, p.color, 4);

      if (missing > 0) {
        player.recoverProgress = (player.recoverProgress || 0) + p.value;
        spawnFloatText(
          level,
          p.x,
          p.y,
          `修复 ${player.recoverProgress}/${PLAYER.proteinPerNucleus}`,
          p.color
        );
        if (player.recoverProgress >= PLAYER.proteinPerNucleus) {
          player.recoverProgress -= PLAYER.proteinPerNucleus;
          if (restoreOneNucleus(player)) {
            spawnFloatText(level, player.x, player.y - 28, "细胞核恢复", "#9be8d6");
            spawnBurst(level, player.x, player.y, player.coreColor, 12);
          }
        }
      } else {
        level.points += p.value;
        spawnFloatText(level, p.x, p.y, "+1", p.color);
      }
    }

    const canEvolve = this._canEvolve();
    for (let i = level.dnas.length - 1; i >= 0; i -= 1) {
      const d = level.dnas[i];
      d.phase += 0.04;
      if (!canEvolve) continue;
      if (!mouthTouchesPoint(mouth, d.x, d.y, d.r, world, 2)) continue;
      level.dnas.splice(i, 1);
      this._evolve();
      break;
    }
  }

  _npcEatProteins() {
    const level = this.level;
    const world = level.world;
    for (const c of level.creatures) {
      if (!c.alive) continue;
      const mouth = mouthWorldPos(c);
      for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
        const p = level.proteins[i];
        if (!mouthTouchesPoint(mouth, p.x, p.y, p.r, world, 1)) continue;
        c.storedProtein = (c.storedProtein || 0) + p.value;
        spawnBurst(level, p.x, p.y, p.color, 3);
        level.proteins.splice(i, 1);
      }
    }
  }

  _checkProteinExhausted() {
    const level = this.level;
    if (level.proteinsExhausted) return;
    if (ecosystemProtein(level) > 0) return;
    level.proteinsExhausted = true;
    if (level.layerIndex < LAYERS.length - 1) {
      spawnFloatText(
        level,
        level.player.x,
        level.player.y - 36,
        "本层蛋白质已尽 · 前往下一层",
        level.layer.accent
      );
      if (level.portal) level.portal.open = true;
    }
  }

  _evolve() {
    const level = this.level;
    const player = level.player;
    const next = player.evolutionId + 1;
    if (next >= EVOLUTIONS.length) return;

    const evo = EVOLUTIONS[next];
    applyEvolution(player, next);
    level.points = 0;
    level.evolvedThisLayer = true;
    spawnBurst(level, player.x, player.y, evo.color, 28);
    spawnFloatText(level, player.x, player.y - 30, `进化·${evo.name}`, evo.color);

    // 开启通往上一层的通道
    if (level.portal && level.layerIndex < LAYERS.length - 1) {
      level.portal.open = true;
    }
  }

  _resolveNucleusCombat() {
    const level = this.level;
    const player = level.player;
    const world = level.world;
    if (!player.alive) return;

    if (aliveNuclei(player).length === 0) {
      player.alive = false;
      this._end("细胞核被吃光", "所有细胞核均被吞噬，生命终止。");
      return;
    }

    const playerMouth = mouthWorldPos(player);

    for (let i = level.creatures.length - 1; i >= 0; i -= 1) {
      const enemy = level.creatures[i];
      if (!enemy.alive) continue;

      // 只有玩家的嘴碰到敌方细胞核，才算吃掉
      for (const n of enemy.nuclei) {
        if (!n.alive) continue;
        const eN = nucleusWorldPos(enemy, n);
        if (mouthTouchesNucleus(playerMouth, eN, world, PLAYER.eatRangeBonus)) {
          n.alive = false;
          spawnBurst(level, eN.x, eN.y, enemy.coreColor, 8);
          spawnFloatText(level, eN.x, eN.y, "吞核", enemy.coreColor);
          // 可激怒生物被攻击后转为攻击性（警告色）
          if (provokeCreature(enemy)) {
            spawnFloatText(level, enemy.x, enemy.y - 26, "激怒！", "#ff5a3c");
            spawnBurst(level, enemy.x, enemy.y, "#ff5a3c", 10);
          }
        }
      }

      if (aliveNuclei(enemy).length === 0) {
        enemy.alive = false;
        decomposeCreature(level, enemy);
        if (enemy.kind === "boss") {
          level.bossDefeated = true;
          level.points += 8;
          spawnFloatText(level, enemy.x, enemy.y - 40, "Boss 分解", enemy.color);
        } else {
          level.points += 3;
        }
        level.creatures.splice(i, 1);
        continue;
      }

      // 仅攻击性生物会用嘴吞噬玩家细胞核
      if (player.invuln > 0 || !isAggressive(enemy)) continue;
      const enemyMouth = mouthWorldPos(enemy);
      let hit = false;
      for (const pn of aliveNuclei(player)) {
        if (hit) break;
        const pN = nucleusWorldPos(player, pn);
        if (mouthTouchesNucleus(enemyMouth, pN, world, PLAYER.eatRangeBonus)) {
          pn.alive = false;
          player.invuln = PLAYER.nucleusHurtCooldown;
          spawnBurst(level, pN.x, pN.y, player.coreColor, 14);
          spawnFloatText(level, pN.x, pN.y, "核损", "#e07a6a");
          hit = true;
        }
      }

      if (aliveNuclei(player).length === 0) {
        player.alive = false;
        this._end(
          "细胞核被吃光",
          enemy.kind === "boss"
            ? `${enemy.name} 用嘴吃光了你的细胞核。`
            : "攻击性生物用嘴吃光了你的细胞核。"
        );
        return;
      }
    }
  }

  _updateVfx(dt) {
    const level = this.level;
    for (let i = level.particles.length - 1; i >= 0; i -= 1) {
      const p = level.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      if (p.life <= 0) level.particles.splice(i, 1);
    }
    for (let i = level.floats.length - 1; i >= 0; i -= 1) {
      const f = level.floats[i];
      f.life -= dt;
      f.y -= 22 * dt;
      if (f.life <= 0) level.floats.splice(i, 1);
    }
  }

  _updatePortal(dt) {
    const level = this.level;
    if (!level.portal) return;
    level.portal.pulse += dt;
    level.portal.open = this._portalOpen();
    if (!level.portal.open) return;

    const player = level.player;
    const dist = wrappedOffset(
      player.x,
      player.y,
      level.portal.x,
      level.portal.y,
      level.world
    ).dist;
    if (dist < level.portal.r) {
      const next = level.layerIndex + 1;
      if (next < LAYERS.length) {
        this.playerState.evolvedThisLayer = false;
        this.start(next, false);
      }
    }
  }

  _end(title, text) {
    this.ended = true;
    this.input.hide();
    this.overlay.show(title, text);
    this.onStateChange?.("overlay");
  }
}
