import { EVOLUTIONS, LAYERS, PLAYER } from "./config.js";
import {
  updatePlayer,
  updateEnemy,
  updateGhost,
  beginEvolution,
  updateEvolution,
  restoreOneNucleus,
  provokeCreature,
  isAggressive,
  aliveNuclei,
  nucleusWorldPos,
  anyMouthTouchesNucleus,
  anyMouthTouchesPoint,
  wrapEntity,
  wrappedOffset,
} from "./creature.js";
import {
  createLevel,
  spawnBurst,
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
      layerIndex: this.level.layerIndex,
      evolutionId: player.evolutionId,
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
    if (player.evolutionTween) updateEvolution(player, dt);
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
      this._end("win");
    }
  }

  _collectPickups() {
    const level = this.level;
    const player = level.player;
    const world = level.world;
    const missing = player.nuclei.length - aliveNuclei(player).length;

    for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
      const p = level.proteins[i];
      p.phase += 0.05;
      if (!anyMouthTouchesPoint(player, p.x, p.y, p.r, world, 1)) continue;

      level.proteins.splice(i, 1);
      level.proteinConsumed += p.value;
      spawnBurst(level, p.x, p.y, p.color, 4);

      if (missing > 0) {
        player.recoverProgress = (player.recoverProgress || 0) + p.value;
        if (player.recoverProgress >= PLAYER.proteinPerNucleus) {
          player.recoverProgress -= PLAYER.proteinPerNucleus;
          if (restoreOneNucleus(player)) {
            spawnBurst(level, player.x, player.y, player.coreColor, 14);
          }
        }
      } else {
        level.points += p.value;
      }
    }

    const canEvolve = this._canEvolve() && !player.evolutionTween;
    for (let i = level.dnas.length - 1; i >= 0; i -= 1) {
      const d = level.dnas[i];
      d.phase += 0.04;
      if (!canEvolve) continue;
      if (!anyMouthTouchesPoint(player, d.x, d.y, d.r, world, 2)) continue;
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
      for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
        const p = level.proteins[i];
        if (!anyMouthTouchesPoint(c, p.x, p.y, p.r, world, 1)) continue;
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
      spawnBurst(level, level.player.x, level.player.y, level.layer.accent, 20);
      if (level.portal) level.portal.open = true;
    }
  }

  _evolve() {
    const level = this.level;
    const player = level.player;
    if (player.evolutionTween) return;
    const next = player.evolutionId + 1;
    if (next >= EVOLUTIONS.length) return;

    const evo = EVOLUTIONS[next];
    beginEvolution(player, next);
    level.points = 0;
    level.evolvedThisLayer = true;
    spawnBurst(level, player.x, player.y, evo.color, 22);
    spawnBurst(level, player.x, player.y, player.coreColor || evo.coreColor, 16);

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
      this._end("end");
      return;
    }

    for (let i = level.creatures.length - 1; i >= 0; i -= 1) {
      const enemy = level.creatures[i];
      if (!enemy.alive) continue;

      // 只有玩家的嘴碰到敌方细胞核，才算吃掉
      for (const n of enemy.nuclei) {
        if (!n.alive) continue;
        const eN = nucleusWorldPos(enemy, n);
        if (anyMouthTouchesNucleus(player, eN, world, PLAYER.eatRangeBonus)) {
          n.alive = false;
          spawnBurst(level, eN.x, eN.y, enemy.coreColor, 8);
          if (provokeCreature(enemy)) {
            spawnBurst(level, enemy.x, enemy.y, "#ff5a3c", 12);
          }
        }
      }

      if (aliveNuclei(enemy).length === 0) {
        enemy.alive = false;
        decomposeCreature(level, enemy);
        if (enemy.kind === "boss") {
          level.bossDefeated = true;
          level.points += 8;
        } else {
          level.points += 3;
        }
        level.creatures.splice(i, 1);
        continue;
      }

      // 仅攻击性生物会用嘴吞噬玩家细胞核
      if (player.invuln > 0 || !isAggressive(enemy)) continue;
      let hit = false;
      for (const pn of aliveNuclei(player)) {
        if (hit) break;
        const pN = nucleusWorldPos(player, pn);
        if (anyMouthTouchesNucleus(enemy, pN, world, PLAYER.eatRangeBonus)) {
          pn.alive = false;
          player.invuln = PLAYER.nucleusHurtCooldown;
          spawnBurst(level, pN.x, pN.y, "#e07a6a", 14);
          hit = true;
        }
      }

      if (aliveNuclei(player).length === 0) {
        player.alive = false;
        this._end("end");
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

  _end(kind = "end") {
    this.ended = true;
    this.input.hide();
    this.overlay.show(kind);
    this.onStateChange?.("overlay");
  }
}
