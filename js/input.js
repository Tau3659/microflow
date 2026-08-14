/**
 * 单指点哪游哪（flOw 手感，手机主场景）
 * 离菌越远越快；拉到最远并按住消耗加速槽。
 * 不跟踪第二指，避免和捏合冲突。无虚拟摇杆、无屏幕加速键。
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.dirX = 0;
    this.dirY = 0;
    this.pull = 0;
    this.boostPressed = false;
    this.holding = false;
    /** 指针相对菌体的屏幕像素，镜头 look-ahead 用 */
    this.aimX = 0;
    this.aimY = 0;
    this._pointerId = null;
    this._clientX = 0;
    this._clientY = 0;
    this._space = false;
    this._keyX = 0;
    this._keyY = 0;
    this._bound = false;
  }

  get moving() {
    return Math.hypot(this.dirX, this.dirY) > 0.12;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    const el = this.canvas;

    const onDown = (e) => {
      if (e.target?.closest?.("button, a, input, textarea, .exit-btn")) return;
      if (this._pointerId != null && e.pointerId !== this._pointerId) return;
      e.preventDefault();
      this._pointerId = e.pointerId;
      this.holding = true;
      this._clientX = e.clientX;
      this._clientY = e.clientY;
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onMove = (e) => {
      if (this._pointerId !== e.pointerId) return;
      e.preventDefault();
      this._clientX = e.clientX;
      this._clientY = e.clientY;
    };

    const release = (e) => {
      if (this._pointerId == null) return;
      if (e && e.pointerId !== this._pointerId) return;
      this._pointerId = null;
      this.holding = false;
      this.dirX = 0;
      this.dirY = 0;
      this.pull = 0;
      this.aimX = 0;
      this.aimY = 0;
      this.boostPressed = this._space;
    };

    el.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    el.addEventListener(
      "gesturestart",
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
    el.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length > 1) e.preventDefault();
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") this._keyY = -1;
      if (e.code === "ArrowDown" || e.code === "KeyS") this._keyY = 1;
      if (e.code === "ArrowLeft" || e.code === "KeyA") this._keyX = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") this._keyX = 1;
      if (e.code === "Space" || e.code === "ShiftLeft") {
        e.preventDefault();
        this._space = true;
      }
      this._normalizeKeys();
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowUp" || e.code === "KeyW") if (this._keyY < 0) this._keyY = 0;
      if (e.code === "ArrowDown" || e.code === "KeyS") if (this._keyY > 0) this._keyY = 0;
      if (e.code === "ArrowLeft" || e.code === "KeyA") if (this._keyX < 0) this._keyX = 0;
      if (e.code === "ArrowRight" || e.code === "KeyD") if (this._keyX > 0) this._keyX = 0;
      if (e.code === "Space" || e.code === "ShiftLeft") this._space = false;
      this._normalizeKeys();
    });
  }

  _normalizeKeys() {
    const len = Math.hypot(this._keyX, this._keyY);
    if (len > 1) {
      this._keyX /= len;
      this._keyY /= len;
    }
  }

  /**
   * 每帧把指针屏幕坐标换成相对菌体的方向和拉力。
   * 菌体游走时目标点钉在手指上，靠近就减速。
   */
  refresh(player, camera, viewW, viewH) {
    if (!this.holding) {
      if (this._keyX || this._keyY) {
        this.dirX = this._keyX;
        this.dirY = this._keyY;
        this.pull = 1;
        this.aimX = this.dirX * 90;
        this.aimY = this.dirY * 90;
      } else {
        this.dirX = 0;
        this.dirY = 0;
        this.pull = 0;
        this.aimX = 0;
        this.aimY = 0;
      }
      this.boostPressed = this._space;
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = viewW / Math.max(1, rect.width);
    const scaleY = viewH / Math.max(1, rect.height);
    const px = (player.x - camera.x);
    const py = (player.y - camera.y);
    const sx = (this._clientX - rect.left) * scaleX;
    const sy = (this._clientY - rect.top) * scaleY;
    const dx = sx - px;
    const dy = sy - py;
    this.aimX = dx;
    this.aimY = dy;
    const dist = Math.hypot(dx, dy);
    const dead = 36;
    const maxPull = Math.max(130, Math.min(viewW, viewH) * 0.36);
    if (dist <= dead) {
      this.dirX = 0;
      this.dirY = 0;
      this.pull = 0;
      this.boostPressed = this._space;
      return;
    }
    this.dirX = dx / dist;
    this.dirY = dy / dist;
    this.pull = Math.min(1, (dist - dead) / (maxPull - dead));
    this.boostPressed = this._space || this.pull >= 0.92;
  }

  show() {}

  hide() {
    this._pointerId = null;
    this.holding = false;
    this.dirX = 0;
    this.dirY = 0;
    this.pull = 0;
    this.aimX = 0;
    this.aimY = 0;
    this.boostPressed = false;
    this._space = false;
  }
}
