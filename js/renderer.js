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

  clear(depth) {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, depth.bgTop);
    g.addColorStop(1, depth.bgBottom);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  drawAmbient(camera, depth) {
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < 48; i += 1) {
      const px = ((i * 173 + this.time * (8 + (i % 5))) % (this.w + 40)) - 20;
      const py =
        ((i * 97 + Math.sin(this.time * 0.4 + i) * 20) % (this.h + 40)) - 20;
      const a = 0.08 + (i % 7) * 0.02;
      ctx.fillStyle = hexToRgba(depth.particle, a);
      ctx.beginPath();
      ctx.arc(px, py, 1 + (i % 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }

    const vignette = ctx.createRadialGradient(
      this.w * 0.5,
      this.h * 0.45,
      this.h * 0.15,
      this.w * 0.5,
      this.h * 0.5,
      this.h * 0.85
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  drawFood(foods, camera) {
    const ctx = this.ctx;
    for (const f of foods) {
      const x = f.x - camera.x;
      const y = f.y - camera.y;
      if (x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) continue;
      const pulse = 0.75 + Math.sin(this.time * 3 + f.phase) * 0.25;
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(f.color, 0.85);
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.arc(x, y, f.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  drawCreature(creature, camera) {
    const ctx = this.ctx;
    const segs = creature.segments;
    if (!segs.length) return;

    const headX = creature.x - camera.x;
    const headY = creature.y - camera.y;
    if (
      headX < -120 ||
      headY < -120 ||
      headX > this.w + 120 ||
      headY > this.h + 120
    ) {
      return;
    }

    const hurt = creature.hurtTimer > 0;
    const base = hurt ? "#e07a6a" : creature.hue;
    const pulse = 1 + Math.sin(creature.pulse) * 0.04;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = segs.length - 1; i >= 0; i -= 1) {
      const t = i / (segs.length - 1 || 1);
      const r = creature.radius * (1 - t * 0.72) * pulse;
      const x = segs[i].x - camera.x;
      const y = segs[i].y - camera.y;
      const alpha = creature.isPlayer ? 0.9 - t * 0.35 : 0.75 - t * 0.3;

      ctx.beginPath();
      ctx.fillStyle = hexToRgba(base, alpha);
      ctx.shadowColor = hexToRgba(base, 0.45);
      ctx.shadowBlur = creature.isPlayer ? 14 : 8;
      ctx.arc(x, y, Math.max(2, r), 0, Math.PI * 2);
      ctx.fill();
    }

    // head core
    ctx.beginPath();
    ctx.fillStyle = hexToRgba("#ffffff", creature.isPlayer ? 0.55 : 0.28);
    ctx.shadowBlur = 0;
    ctx.arc(headX, headY, Math.max(2, creature.radius * 0.28 * pulse), 0, Math.PI * 2);
    ctx.fill();

    // eye-ish dots for personality
    const ox = Math.cos(creature.angle) * creature.radius * 0.35;
    const oy = Math.sin(creature.angle) * creature.radius * 0.35;
    ctx.beginPath();
    ctx.fillStyle = hexToRgba("#031016", 0.7);
    ctx.arc(headX + ox, headY + oy, Math.max(1.2, creature.radius * 0.12), 0, Math.PI * 2);
    ctx.fill();

    if (creature.isPredator && !creature.isPlayer) {
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba("#e07a6a", 0.45);
      ctx.lineWidth = 1.5;
      ctx.arc(headX, headY, creature.radius * 1.25 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPortal(portal, camera, open) {
    if (!portal) return;
    const ctx = this.ctx;
    const x = portal.x - camera.x;
    const y = portal.y - camera.y;
    if (x < -80 || y < -80 || x > this.w + 80 || y > this.h + 80) return;

    const pulse = 1 + Math.sin(portal.pulse * 3) * 0.08;
    const r = portal.r * pulse;
    const color = open ? "#3ecfb0" : "rgba(232,244,242,0.25)";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(portal.pulse * 0.6);

    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.strokeStyle = open
        ? hexToRgba("#3ecfb0", 0.55 - i * 0.15)
        : `rgba(232,244,242,${0.18 - i * 0.04})`;
      ctx.lineWidth = 2;
      ctx.ellipse(0, 0, r * (1 + i * 0.22), r * (0.55 + i * 0.1), 0, 0, Math.PI * 2);
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
    ctx.fillStyle = open ? hexToRgba("#e8f4f2", 0.75) : "rgba(232,244,242,0.35)";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(open ? "下潜" : "成长后开启", x, y + r + 18);
  }

  drawParticles(particles, camera) {
    const ctx = this.ctx;
    for (const p of particles) {
      const x = p.x - camera.x;
      const y = p.y - camera.y;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.fillStyle = hexToRgba(p.color, a);
      ctx.arc(x, y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPointerGuide(input, player, camera) {
    if (!input.active) return;
    const ctx = this.ctx;
    const px = player.x - camera.x;
    const py = player.y - camera.y;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(232,244,242,0.18)";
    ctx.lineWidth = 1;
    ctx.moveTo(px, py);
    ctx.lineTo(input.x, input.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = "rgba(62,207,176,0.35)";
    ctx.arc(input.x, input.y, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  render(level, camera, input, openPortal) {
    this.time += 0.016;
    this.clear(level.depth);
    this.drawAmbient(camera, level.depth);
    this.drawFood(level.foods, camera);
    this.drawPortal(level.portal, camera, openPortal);
    for (const c of level.creatures) this.drawCreature(c, camera);
    this.drawCreature(level.player, camera);
    this.drawParticles(level.particles, camera);
    this.drawPointerGuide(input, level.player, camera);
  }
}
