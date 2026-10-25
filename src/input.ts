export class Input {
  private keys = new Set<string>();
  private lastWTap = 0;
  sprintHeld = false;   // doble toque de W o Ctrl
  mouseDX = 0;
  mouseDY = 0;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'KeyW') {
        const now = performance.now();
        if (now - this.lastWTap < 300) this.sprintHeld = true;
        this.lastWTap = now;
      }
      if (e.code === 'ControlLeft') this.sprintHeld = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') this.sprintHeld = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.sprintHeld = false; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
  }

  down(code: string) { return this.keys.has(code); }
  get forward() { return (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0); }
  /** +1 = derecha */
  get strafe() { return (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0); }
  get jump() { return this.down('Space'); }
  get sneak() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
}
