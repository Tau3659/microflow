import { EVOLUTIONS } from "./config.js";
import { aliveNuclei, nucleusWorldPos } from "./creature.js";

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.time = 0;
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  clear(layer) {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, layer.bgTop);
    g.addColorStop(1, layer.bgBottom);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  drawAmbient(layer) {
    const ctx = this.ctx;
    for (let i = 0; i < 40; i += 1) {
      const px = ((i * 173 + this.time * (6 + (i % 4))) % (this.w + 40)) - 20;
      const py = ((i * 97 + Math.sin(this.time * 0.35 + i) * 16) % (this.h + 40)) - 20;
      ctx.fillStyle = hexToRgba(layer.protein, 0.08 + (i % 5) * 0.02);
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3) * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const vignette = ctx.createRadialGradient(
      this.w * 0.5,
      this.h * 0.45,
      this.h * 0.12,
      this.w * 0.5,
      this.h * 0.5,
      this.h * 0.9
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawProteins(proteins, camera) {
    const ctx = this.ctx;
    for (const p of proteins) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      if (x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) continue;
      const pulse = 0.85 + Math.sin(this.time * 3.2 + p.phase) * 0.15;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, 0.9);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      // 蛋白质：圆润小团
      ctx.arc(x, y, p.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawDnas(dnas, camera, canEvolve) {
    const ctx = this.ctx;
    for (const d of dnas) {
      const x = d.x - camera.x;
      const y = d.y - camera.y;
      if (x < -30 || y < -30 || x > this.w + 30 || y > this.h + 30) continue;
      const pulse = 1 + Math.sin(this.time * 4 + d.phase) * 0.08;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * 1.2 + d.phase);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = d.color;
      ctx.shadowBlur = canEvolve ? 16 : 6;
      ctx.strokeStyle = hexToRgba(d.color, canEvolve ? 0.95 : 0.4);
      ctx.lineWidth = 2.2;
      // DNA 双螺旋示意
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 1) {
        const t = i / 8;
        const px = t * d.r;
        const py = Math.sin(t * Math.PI * 2) * d.r * 0.45;
        if (i === -8) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 1) {
        const t = i / 8;
        const px = t * d.r;
        const py = -Math.sin(t * Math.PI * 2) * d.r * 0.45;
        if (i === -8) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (canEvolve) {
        ctx.fillStyle = hexToRgba(d.color, 0.2);
        ctx.beginPath();
        ctx.arc(0, 0, d.r * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  drawCreature(creature, camera) {
    const ctx = this.ctx;
    const segs = creature.segments;
    const headX = creature.x - camera.x;
    const headY = creature.y - camera.y;
    if (headX < -160 || headY < -160 || headX > this.w + 160 || headY > this.h + 160) {
      return;
    }

    const pulse = 1 + Math.sin(creature.pulse) * 0.045;
    const evo = creature.kind === "player" ? EVOLUTIONS[creature.evolutionId] : null;

    // 身体节
    for (let i = segs.length - 1; i >= 0; i -= 1) {
      const t = i / (segs.length - 1 || 1);
      let r = creature.radius * (1 - t * 0.68) * pulse;
      // 多细胞/病毒形态更“分节”
      if (evo && evo.complexity >= 3) {
        r *= 0.92 + Math.sin(creature.pulse + i) * 0.06;
      }
      const x = segs[i].x - camera.x;
      const y = segs[i].y - camera.y;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(creature.color, creature.kind === "player" ? 0.88 - t * 0.3 : 0.72 - t * 0.28);
      ctx.shadowColor = hexToRgba(creature.color, 0.4);
      ctx.shadowBlur = creature.kind === "boss" ? 18 : 10;
      ctx.arc(x, y, Math.max(2.5, r), 0, Math.PI * 2);
      ctx.fill();
    }

    // 病毒形态：外壳刺突
    if (evo && evo.id === 4) {
      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(creature.angle);
      ctx.strokeStyle = hexToRgba(creature.color, 0.75);
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * 2 * i) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * creature.radius * 0.7, Math.sin(a) * creature.radius * 0.7);
        ctx.lineTo(Math.cos(a) * creature.radius * 1.25, Math.sin(a) * creature.radius * 1.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = hexToRgba(creature.coreColor, 0.8);
        ctx.arc(Math.cos(a) * creature.radius * 1.25, Math.sin(a) * creature.radius * 1.25, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 细胞核（战斗核心）
    for (const n of creature.nuclei) {
      if (!n.alive) continue;
      const wp = nucleusWorldPos(creature, n);
      const nx = wp.x - camera.x;
      const ny = wp.y - camera.y;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(creature.coreColor, 0.95);
      ctx.shadowColor = creature.coreColor;
      ctx.shadowBlur = 12;
      ctx.arc(nx, ny, wp.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = hexToRgba("#031016", 0.55);
      ctx.shadowBlur = 0;
      ctx.arc(nx, ny, wp.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    if (creature.kind === "boss") {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(creature.color, 0.5);
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.arc(headX, headY, creature.radius * 1.2 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = hexToRgba("#e8f4f2", 0.7);
      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(creature.name, headX, headY - creature.radius - 14);
      const left = aliveNuclei(creature).length;
      ctx.fillText(`核 ${left}`, headX, headY - creature.radius - 1);
    }

    if (creature.kind === "player" && creature.boostTimer > 0) {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba("#e8c27a", 0.55);
      ctx.lineWidth = 2;
      ctx.arc(headX, headY, creature.radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
  }

  drawPortal(portal, camera, open) {
    if (!portal) return;
    const ctx = this.ctx;
    const x = portal.x - camera.x;
    const y = portal.y - camera.y;
    if (x < -100 || y < -100 || x > this.w + 100 || y > this.h + 100) return;

    const pulse = 1 + Math.sin(portal.pulse * 2.8) * 0.08;
    const r = portal.r * pulse;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(portal.pulse * 0.5);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.strokeStyle = open
        ? hexToRgba("#3ecfb0", 0.6 - i * 0.15)
        : "rgba(232,244,242,0.18)";
      ctx.lineWidth = 2;
      ctx.ellipse(0, 0, r * (1 + i * 0.2), r * (0.55 + i * 0.08), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (open) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
      g.addColorStop(0, "rgba(62,207,176,0.35)");
      g.addColorStop(1, "rgba(62,207,176,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = open ? "rgba(232,244,242,0.8)" : "rgba(232,244,242,0.35)";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(open ? "进入上一层生物圈" : "进化后开启", x, y + r + 18);
  }

  drawParticles(particles, camera) {
    const ctx = this.ctx;
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, a);
      ctx.arc(p.x - camera.x, p.y - camera.y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFloats(floats, camera) {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, sans-serif";
    for (const f of floats) {
      const a = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = hexToRgba(f.color, a);
      ctx.fillText(f.text, f.x - camera.x, f.y - camera.y - (1 - a) * 28);
    }
  }

  render(level, camera, canEvolve, portalOpen) {
    this.time += 0.016;
    this.clear(level.layer);
    this.drawAmbient(level.layer);
    this.drawPortal(level.portal, camera, portalOpen);
    this.drawProteins(level.proteins, camera);
    this.drawDnas(level.dnas, camera, canEvolve);
    for (const c of level.creatures) this.drawCreature(c, camera);
    this.drawCreature(level.player, camera);
    this.drawParticles(level.particles, camera);
    this.drawFloats(level.floats, camera);
  }
}
