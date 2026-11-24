import * as THREE from "three";
import { MORPH, PARALLAX } from "./config.js";

function hexToRgba(hex, alpha = 1) {
  const h = String(hex || "#ffffff").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToColor(hex) {
  return new THREE.Color(hex || "#ffffff");
}

function makeSpriteTexture() {
  const cvs = document.createElement("canvas");
  cvs.width = 64;
  cvs.height = 64;
  const ctx = cvs.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.time = 0;
    this.viewZoom = 1.3 / 1.4;
    this.counterFlow = { x: 0, y: 0 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
    this.camera.position.z = 500;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    this.bgGroup = new THREE.Group();
    this.scene.add(this.bgGroup);

    this.spriteTex = makeSpriteTexture();
    this.shared = {
      sphere: new THREE.SphereGeometry(1, 24, 24),
      capsule: new THREE.CapsuleGeometry(1, 2, 4, 12),
      cone: new THREE.ConeGeometry(1, 3, 8),
      ring: new THREE.RingGeometry(0.82, 1, 32),
      plane: new THREE.PlaneGeometry(1, 1),
      circle: new THREE.CircleGeometry(1, 32),
    };

    this._bgMesh = null;
    this._bgUniforms = null;
    this._moteSystem = null;
    this._parallaxGroup = new THREE.Group();
    this.camera.add(this._parallaxGroup);
    this._parallaxGroup.position.z = -50;
    this._creatureMeshes = new Map();
    this._lastLayerKey = null;

    this._tmpVec = new THREE.Vector3();
    this._tmpColor = new THREE.Color();
  }

  slideMetrics() {
    const w = this.w;
    const h = this.h;
    const topBar = 52;
    const controls = document.getElementById("controls");
    let thumbZone = h > w ? h * 0.33 : 148;
    if (controls && !controls.classList.contains("hidden")) {
      const rect = controls.getBoundingClientRect();
      if (rect.height > 0) {
        thumbZone = Math.max(96, h - rect.top);
      }
    }
    const playH = Math.max(80, h - topBar - thumbZone);
    const cx = w * 0.5;
    const cy = h * 0.4;
    const r = Math.max(w * 0.58, h * 0.38);
    return { cx, cy, r, topBar, thumbZone, playH };
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h);
    this._updateCameraFrustum();
  }

  _updateCameraFrustum() {
    const z = this.viewZoom || 1;
    const aspect = this.w / Math.max(1, this.h);
    const h2 = this.h / z / 2;
    const w2 = (this.w / z) / 2;
    this.camera.left = -w2;
    this.camera.right = w2;
    this.camera.top = h2;
    this.camera.bottom = -h2;
    this.camera.updateProjectionMatrix();
  }

  _ensureBackground(level) {
    const layer = level.layer;
    const next = level.nextLayer;
    const key = `${layer.bgTop}-${layer.bgBottom}-${next?.bgTop}-${next?.bgBottom}`;
    if (this._lastLayerKey === key && this._bgMesh) return;
    this._lastLayerKey = key;

    if (!this._bgMesh) {
      const geo = new THREE.PlaneGeometry(2, 2);
      const uni = {
        top: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        alpha: { value: 1 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: uni,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 bottom;
          uniform float alpha;
          varying vec2 vUv;
          void main() {
            vec3 col = mix(bottom, top, vUv.y);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -1000;
      this.bgGroup.add(mesh);
      this._bgMesh = mesh;
      this._bgUniforms = uni;
    }

    const u = this._bgUniforms;
    if (next) {
      u.top.value.set(next.bgTop);
      u.bottom.value.set(layer.bgBottom);
    } else {
      u.top.value.set(layer.bgTop);
      u.bottom.value.set(layer.bgBottom);
    }
    u.alpha.value = 1;
  }

  _updateMotAndBlobs(level) {
    const layer = level.layer;
    const next = level.nextLayer || layer;
    const deep = level.deepField;
    const key = level.layerIndex ?? 0;
    if (this._moteSystem && this._moteSystem.userData.layerKey === key) return;

    if (this._moteSystem) {
      this.bgGroup.remove(this._moteSystem);
      this._moteSystem.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this._moteSystem = null;
    }
    if (!deep) return;

    const group = new THREE.Group();
    group.renderOrder = -900;
    group.userData = { layerKey: key };

    const motesMat = new THREE.SpriteMaterial({
      map: this.spriteTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (const m of deep.motes) {
      const s = new THREE.Sprite(motesMat.clone());
      s.position.set(m.x, -m.y, -80);
      s.scale.setScalar(m.r * 2);
      s.material.color.set(next.protein || layer.protein);
      s.material.opacity = 0.25 + Math.random() * 0.2;
      group.add(s);
    }

    for (const b of deep.blobs) {
      const s = new THREE.Sprite(motesMat.clone());
      s.position.set(b.x, -b.y, -90);
      s.scale.setScalar(b.r * 2);
      s.material.color.set(next.bgTop || layer.bgTop);
      s.material.opacity = 0.06 + Math.random() * 0.08;
      group.add(s);
    }

    this.bgGroup.add(group);
    this._moteSystem = group;
  }

  _updateParallax(level, camera) {
    while (this._parallaxGroup.children.length > 0) {
      const c = this._parallaxGroup.children[0];
      this._parallaxGroup.remove(c);
      if (c.material) c.material.dispose();
    }

    const layer = level.layer;
    const srcX = level.player?.x ?? camera.x;
    const srcY = level.player?.y ?? camera.y;
    const { cx, cy } = this.slideMetrics();
    const accent = layer.accent || "#3ecfb0";

    const spriteMat = new THREE.SpriteMaterial({
      map: this.spriteTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const slowK = PARALLAX.slow;
    const fieldX = Math.max(160, this.w * 0.95);
    const fieldY = Math.max(160, this.h * 0.95);

    for (let i = 0; i < 7; i += 1) {
      const s = new THREE.Sprite(spriteMat.clone());
      const wrapX = ((i * 367 + 40 - srcX * slowK) % fieldX + fieldX) % fieldX - fieldX * 0.5;
      const wrapY = ((i * 271 + 80 - srcY * slowK) % fieldY + fieldY) % fieldY - fieldY * 0.5;
      s.position.set(cx - this.w * 0.5 + wrapX, this.h * 0.5 - cy + wrapY, -20);
      const scale = 90 + (i % 5) * 24;
      s.scale.set(scale, scale * 0.55, 1);
      s.material.color.set(accent);
      s.material.opacity = 0.05 + (i % 3) * 0.015;
      this._parallaxGroup.add(s);
    }

    const fastK = PARALLAX.fast;
    for (let i = 0; i < 16; i += 1) {
      const s = new THREE.Sprite(spriteMat.clone());
      const wrapX = ((i * 97 + 11 - srcX * fastK) % fieldX + fieldX) % fieldX - fieldX * 0.5;
      const wrapY = ((i * 83 + 19 - srcY * fastK) % fieldY + fieldY) % fieldY - fieldY * 0.5;
      s.position.set(cx - this.w * 0.5 + wrapX, this.h * 0.5 - cy + wrapY, -10);
      s.scale.setScalar(4 + (i % 3) * 1.5);
      s.material.color.set("#94a8a6");
      s.material.opacity = 0.15 + (i % 3) * 0.03;
      this._parallaxGroup.add(s);
    }
  }

  _makeMesh(geo, color, opacity = 1, additive = false) {
    const mat = new THREE.MeshBasicMaterial({
      color: hexToColor(color),
      transparent: opacity < 1 || additive,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    return mesh;
  }

  _addFlagella(group, creature) {
    const count = creature.flagella || 0;
    if (!count) return;
    const r = creature.radius || 16;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xe8f4f2),
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    for (let i = 0; i < count; i += 1) {
      const base = Math.PI + (i - (count - 1) / 2) * 0.35;
      const tail = new THREE.Group();
      const segs = 8;
      const segLen = r * 0.22;
      const thick = r * 0.04;
      for (let s = 0; s < segs; s += 1) {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(thick * (1 - s / segs * 0.5), 6, 6),
          mat
        );
        m.position.set(Math.cos(base) * (r * 0.7 + s * segLen), Math.sin(base) * (r * 0.35 + s * segLen * 0.1), -2 - s * 0.5);
        tail.add(m);
      }
      tail.userData = { phase: i, base };
      group.add(tail);
    }
  }

  _addCilia(group, creature) {
    const r = creature.radius || 16;
    const n = 24;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xe8f4f2),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8f4f2, transparent: true, opacity: 0.25 });
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n;
      const pts = [
        new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 1),
        new THREE.Vector3(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, 1),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, lineMat.clone());
      line.userData = { angle: a };
      group.add(line);
    }
  }

  _addSpikes(group, creature) {
    const count = creature.spikes || 0;
    if (!count) return;
    const r = creature.radius || 16;
    const mat = new THREE.MeshBasicMaterial({
      color: hexToColor(creature.color),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count;
      const spike = new THREE.Mesh(this.shared.cone, mat.clone());
      spike.position.set(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, 2);
      spike.rotation.z = a - Math.PI / 2;
      const s = r * 0.18;
      spike.scale.set(s, s * 1.8, s);
      group.add(spike);
    }
  }

  _addColonyCells(group, creature) {
    const count = creature.colonyCells || 0;
    if (!count) return;
    const r = creature.radius || 16;
    const mat = new THREE.MeshBasicMaterial({
      color: hexToColor(creature.coreColor),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + creature.pulse * 0.05;
      const dist = r * (0.55 + (i % 2) * 0.18);
      const cell = new THREE.Mesh(this.shared.sphere, mat.clone());
      cell.position.set(Math.cos(a) * dist, Math.sin(a) * dist, 1 + (i % 2) * 2);
      const s = r * (0.22 + (i % 3) * 0.04);
      cell.scale.setScalar(s);
      group.add(cell);
    }
  }

  _buildCreature(creature, ghost = false) {
    const group = new THREE.Group();
    const r = creature.radius || 16;
    const alpha = ghost ? 0.35 : 1;

    let body;
    const morph = creature.morph;
    const color = creature.color || "#3ecfb0";
    const membrane = creature.membrane || "#1a6b62";
    const core = creature.coreColor || "#9be8d6";

    if (morph === MORPH.BACILLUS || morph === MORPH.SPIRILLUM || morph === MORPH.PHAGE) {
      const aspect = creature.aspect || 1;
      const len = Math.max(r, r * aspect * 0.8);
      body = new THREE.Mesh(
        this.shared.capsule,
        new THREE.MeshBasicMaterial({ color: hexToColor(membrane), transparent: alpha < 1, opacity: alpha, depthWrite: false })
      );
      body.scale.set(r * 0.65, len * 0.5, r * 0.65);
      body.rotation.z = Math.PI / 2;
    } else if (morph === MORPH.COLONY) {
      body = new THREE.Mesh(
        this.shared.sphere,
        new THREE.MeshBasicMaterial({ color: hexToColor(membrane), transparent: alpha < 1, opacity: alpha, depthWrite: false })
      );
      body.scale.setScalar(r * 0.9);
      this._addColonyCells(group, creature);
    } else {
      // COCCUS / VIRUS default
      body = new THREE.Mesh(
        this.shared.sphere,
        new THREE.MeshBasicMaterial({ color: hexToColor(membrane), transparent: alpha < 1, opacity: alpha, depthWrite: false })
      );
      body.scale.setScalar(r);
    }
    body.renderOrder = 2;
    group.add(body);

    // inner glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.spriteTex,
      color: hexToColor(color),
      transparent: true,
      opacity: 0.18 * alpha,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.scale.setScalar(r * 2.6);
    glow.position.z = -1;
    group.add(glow);

    // nuclei (local offsets, flipped y)
    if (creature.nuclei) {
      for (const n of creature.nuclei) {
        if (ghost && !n.alive) continue;
        const nr = n.r || r * 0.36;
        const nm = new THREE.Mesh(
          this.shared.sphere,
          new THREE.MeshBasicMaterial({
            color: hexToColor(n.alive ? core : "#3a2020"),
            transparent: true,
            opacity: n.alive ? 0.92 * alpha : 0.35 * alpha,
            depthWrite: false,
          })
        );
        nm.scale.setScalar(nr);
        nm.position.set(n.ox, -n.oy, 4);
        nm.renderOrder = 5;
        group.add(nm);

        const nGlow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.spriteTex,
          color: hexToColor(n.alive ? core : "#3a2020"),
          transparent: true,
          opacity: 0.22 * alpha,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        nGlow.scale.setScalar(nr * 2.4);
        nGlow.position.set(n.ox, -n.oy, 3);
        group.add(nGlow);
      }
    }

    // complexity organelles
    const org = creature.organelles || 0;
    if (org) {
      for (let i = 0; i < org; i += 1) {
        const a = (Math.PI * 2 * i) / Math.max(1, org) + creature.pulse * 0.08 + i * 0.4;
        const dist = r * (0.28 + (i % 3) * 0.12);
        const m = new THREE.Mesh(
          this.shared.sphere,
          new THREE.MeshBasicMaterial({ color: hexToColor(core), transparent: true, opacity: 0.22 * alpha, depthWrite: false })
        );
        m.scale.set(r * 0.12, r * 0.08, r * 0.12);
        m.position.set(Math.cos(a) * dist, Math.sin(a) * dist, 3);
        group.add(m);
      }
    }

    // membrane layers
    const layers = creature.membraneLayers || 1;
    if (layers > 1) {
      for (let L = 1; L < layers; L += 1) {
        const ring = new THREE.Mesh(
          this.shared.ring,
          new THREE.MeshBasicMaterial({
            color: hexToColor(membrane),
            transparent: true,
            opacity: 0.12 * alpha,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        ring.scale.setScalar(r * (0.72 + L * 0.12));
        ring.position.z = -2 - L;
        group.add(ring);
      }
    }

    // mouths (local offsets, flipped y)
    const mouths = creature.mouths?.length
      ? creature.mouths
      : [{ mouthAngle: creature.mouthAngle || 0, mouthDist: creature.mouthDist || 0.95, mouthRadius: creature.mouthRadius || r * 0.32 }];
    for (const m of mouths) {
      const mouth = new THREE.Mesh(
        this.shared.sphere,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 * alpha, depthWrite: false })
      );
      const d = (m.mouthDist ?? 0.95) * r;
      const a = m.mouthAngle || 0;
      mouth.position.set(Math.cos(a) * d, -Math.sin(a) * d, 5);
      mouth.scale.setScalar((m.mouthRadius || r * 0.32) * 0.8);
      group.add(mouth);
    }

    // spikes, flagella, cilia
    this._addSpikes(group, creature);
    this._addFlagella(group, creature);
    if (creature.cilia) this._addCilia(group, creature);

    return group;
  }

  _drawCreatures(level) {
    const player = level.player;
    const creatures = level.creatures || [];
    const ghosts = level.ghosts || [];
    const now = this.time;

    // player segments as trailing meshes
    if (player.segments && player.segments.length > 1) {
      for (let i = 1; i < player.segments.length; i += 1) {
        const s = player.segments[i];
        const prev = player.segments[i - 1];
        const t = i / player.segments.length;
        const r = player.radius * (0.55 + (1 - t) * 0.45) * (1 - t * 0.2);
        const seg = new THREE.Mesh(
          this.shared.sphere,
          new THREE.MeshBasicMaterial({
            color: hexToColor(player.color),
            transparent: true,
            opacity: 0.35 * (1 - t),
            depthWrite: false,
          })
        );
        seg.scale.setScalar(r);
        seg.position.set(s.x, -s.y, -3 - i);
        this.worldGroup.add(seg);
      }
    }

    // player
    const pGroup = this._buildCreature(player);
    pGroup.position.set(player.x, -player.y, 0);
    pGroup.rotation.z = -player.angle;
    this.worldGroup.add(pGroup);

    // enemies and boss
    for (const c of creatures) {
      const g = this._buildCreature(c);
      g.position.set(c.x, -c.y, 0);
      g.rotation.z = -c.angle;
      const warn = c.provokeFlash > 0 ? Math.min(1, c.provokeFlash) : 0;
      if (warn > 0) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.spriteTex,
          color: 0xff5a3c,
          transparent: true,
          opacity: warn * 0.25,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        s.scale.setScalar(c.radius * 3);
        g.add(s);
      }
      this.worldGroup.add(g);
    }

    // ghosts
    for (const g of ghosts) {
      const ghost = this._buildCreature(g, true);
      ghost.position.set(g.x, -g.y, -20);
      ghost.rotation.z = -g.angle;
      ghost.scale.setScalar(1);
      this.worldGroup.add(ghost);
    }
  }

  _drawPickups(level) {
    const proteins = level.proteins || [];
    const dnas = level.dnas || [];
    const abilities = level.abilities || [];

    const protoMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    const dnaMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });

    for (const p of proteins) {
      const m = new THREE.Mesh(this.shared.sphere, protoMat.clone());
      m.material.color.set(p.color || level.layer.protein);
      m.position.set(p.x, -p.y, 2);
      const s = p.r * (1 + Math.sin(p.phase + this.time * 2) * 0.08);
      m.scale.setScalar(s);
      this.worldGroup.add(m);
    }

    for (const d of dnas) {
      const m = new THREE.Mesh(this.shared.sphere, dnaMat.clone());
      m.material.color.set(d.color || level.layer.dna);
      m.position.set(d.x, -d.y, 3);
      const s = d.r * (1 + Math.cos(d.phase + this.time * 2.5) * 0.1);
      m.scale.setScalar(s);
      this.worldGroup.add(m);
    }

    for (const a of abilities) {
      const m = new THREE.Mesh(this.shared.sphere, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      m.material.color.set(a.color || "#ffffff");
      m.position.set(a.x, -a.y, 3);
      m.scale.setScalar(a.r || 8);
      this.worldGroup.add(m);
    }
  }

  _drawParticles(level) {
    for (const p of level.particles || []) {
      const m = new THREE.Mesh(
        this.shared.sphere,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: Math.max(0, p.life / p.maxLife), depthWrite: false })
      );
      m.material.color.set(p.color || "#3ecfb0");
      m.position.set(p.x, -p.y, 4);
      m.scale.setScalar(p.r);
      this.worldGroup.add(m);
    }
  }

  _drawPortals(level) {
    const portals = [];
    if (level.portal) portals.push(level.portal);
    if (level.exitPortal) portals.push(level.exitPortal);

    for (const p of portals) {
      const pulse = Math.sin((p.pulse || 0) * 3) * 0.05 + 1;
      const ring = new THREE.Mesh(
        this.shared.ring,
        new THREE.MeshBasicMaterial({
          color: hexToColor(p.color),
          transparent: true,
          opacity: p.open ? 0.55 : 0.18,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      ring.position.set(p.x, -p.y, -10);
      ring.scale.setScalar(p.r * pulse);
      this.worldGroup.add(ring);

      const inner = new THREE.Mesh(
        this.shared.circle,
        new THREE.MeshBasicMaterial({
          color: hexToColor(p.color),
          transparent: true,
          opacity: p.open ? 0.12 : 0.03,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      inner.position.set(p.x, -p.y, -11);
      inner.scale.setScalar(p.r * 0.86);
      this.worldGroup.add(inner);
    }
  }

  _clearWorld() {
    while (this.worldGroup.children.length > 0) {
      const c = this.worldGroup.children[0];
      this.worldGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
      if (c.children) {
        c.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    }
  }

  render(level, camera, canEvolve, portalOpen, trAlpha, accent, zoom) {
    this.time += 0.016;
    this.viewZoom = zoom || 1.3 / 1.4;
    this._updateCameraFrustum();

    const { cx, cy } = this.slideMetrics();
    const targetX = camera.x + cx;
    const targetY = -(camera.y + cy);

    this.camera.position.set(targetX, targetY, 500);
    this.camera.lookAt(targetX, targetY, 0);

    this._clearWorld();
    this._ensureBackground(level);
    this._updateMotAndBlobs(level);
    this._updateParallax(level, camera);

    this._drawPortals(level);
    this._drawPickups(level);
    this._drawCreatures(level);
    this._drawParticles(level);

    // transition overlay handled by CSS/JS, just dim world
    if (trAlpha > 0) {
      const dim = new THREE.Mesh(
        new THREE.PlaneGeometry(this.w * 4, this.h * 4),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: trAlpha * 0.7, depthWrite: false })
      );
      dim.position.set(targetX, targetY, 100);
      dim.lookAt(this.camera.position);
      this.worldGroup.add(dim);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
