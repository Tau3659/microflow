export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this._bound = false;
    this.onFirstPointer = null;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    const setPoint = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      this.x = ((clientX - rect.left) / rect.width) * this.canvas.width;
      this.y = ((clientY - rect.top) / rect.height) * this.canvas.height;
    };

    const down = (clientX, clientY) => {
      const wasActive = this.active;
      this.active = true;
      setPoint(clientX, clientY);
      if (!wasActive && this.onFirstPointer) this.onFirstPointer();
    };

    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        this.canvas.setPointerCapture?.(e.pointerId);
        down(e.clientX, e.clientY);
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      "pointermove",
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        setPoint(e.clientX, e.clientY);
      },
      { passive: false }
    );

    const up = () => {
      this.active = false;
    };

    this.canvas.addEventListener("pointerup", up);
    this.canvas.addEventListener("pointercancel", up);
    this.canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.active = false;
    });
  }
}
