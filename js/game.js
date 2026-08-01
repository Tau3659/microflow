import { EVOLUTIONS, LAYERS, PLAYER } from "./config.js";
import {
  updatePlayer,
  updateEnemy,
  updateGhost,
  applyEvolution,
  aliveNuclei,
  nucleusWorldPos,
  wrapEntity,
  wrappedOffset,
} from "./creature.js";
import {
  createLevel,
  spawnBurst,
  spawnFloatText,
  decomposeCreature,
  maintainPickups,
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
    // 进化后可前往上一层生物圈
    return this.level.evolvedThisLayer && this.level.layerIndex < LAYERS.length - 1;
  }

  _updateHud() {
    const player = this.level.player;
    const evo = EVOLUTIONS[player.evolutionId];
    const need = evo.pointsToEvolve;
    const nucleiAlive = aliveNuclei(player).length;
    this.hud.setInfo({
      layer: this.level.layer.name,
      form: evo.name,
      points: this.level.points,
      need: need === Infinity ? "MAX" : need,
      nuclei: nucleiAlive,
      nucleiMax: player.nuclei.length,
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
      updateEnemy(c, player, dt, level.world);
    }
    for (const g of level.ghosts || []) {
      updateGhost(g, dt, level.world);
    }

    this._collectPickups();
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

    for (let i = level.proteins.length - 1; i >= 0; i -= 1) {
      const p = level.proteins[i];
      p.phase += 0.05;
      const d = wrappedOffset(player.x, player.y, p.x, p.y, world).dist;
      if (d < player.radius + p.r) {
        level.points += p.value;
        spawnBurst(level, p.x, p.y, p.color, 4);
        spawnFloatText(level, p.x, p.y, "+1", p.color);
        level.proteins.splice(i, 1);
      }
    }

    const canEvolve = this._canEvolve();
    for (let i = level.dnas.length - 1; i >= 0; i -= 1) {
      const d = level.dnas[i];
      d.phase += 0.04;
      if (!canEvolve) continue;
      const dist = wrappedOffset(player.x, player.y, d.x, d.y, world).dist;
      if (dist < player.radius + d.r) {
        level.dnas.splice(i, 1);
        this._evolve();
        break;
      }
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

    const playerCores = aliveNuclei(player);
    if (playerCores.length === 0) {
      player.alive = false;
      this._end("细胞核被吃光", "所有细胞核均被吞噬，生命终止。");
      return;
    }

    for (let i = level.creatures.length - 1; i >= 0; i -= 1) {
      const enemy = level.creatures[i];
      if (!enemy.alive) continue;

      // 玩家任一细胞核可吞噬敌方核
      for (const pn of playerCores) {
        const pN = nucleusWorldPos(player, pn);
        for (const n of enemy.nuclei) {
          if (!n.alive) continue;
          const eN = nucleusWorldPos(enemy, n);
          const off = wrappedOffset(pN.x, pN.y, eN.x, eN.y, world);
          const eatRange = pN.r + eN.r + PLAYER.eatRangeBonus;
          if (off.dist < eatRange && player.radius + 8 >= enemy.radius * 0.55) {
            n.alive = false;
            spawnBurst(level, eN.x, eN.y, enemy.coreColor, 8);
            spawnFloatText(level, eN.x, eN.y, "核破", enemy.coreColor);
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

      // 敌方吞掉玩家一个核；全部吃光才结束
      if (player.invuln > 0) continue;
      const threat =
        enemy.kind === "boss" || enemy.radius >= player.radius * 0.85;
      if (!threat) continue;

      let hit = false;
      for (const n of enemy.nuclei) {
        if (!n.alive || hit) continue;
        const eN = nucleusWorldPos(enemy, n);
        for (const pn of aliveNuclei(player)) {
          const pN = nucleusWorldPos(player, pn);
          const off = wrappedOffset(eN.x, eN.y, pN.x, pN.y, world);
          if (off.dist < eN.r + pN.r + 2) {
            pn.alive = false;
            player.invuln = PLAYER.nucleusHurtCooldown;
            spawnBurst(level, pN.x, pN.y, player.coreColor, 14);
            spawnFloatText(level, pN.x, pN.y, "核损", "#e07a6a");
            hit = true;
            break;
          }
        }
      }

      if (aliveNuclei(player).length === 0) {
        player.alive = false;
        this._end(
          "细胞核被吃光",
          enemy.kind === "boss"
            ? `${enemy.name} 吃光了你的细胞核。`
            : "敌方生物吃光了你的细胞核。"
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
