// Réplica de BlockDustParticle / Particle / ParticleManager.addBlockBreakParticles (1.21.1)
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3,
} from 'three';
import { clipAxis } from './collision';
import { T } from './renderer';
import { Block, World } from './world';

const MAX_PARTICLES = 2048;      // vanilla: 16384
const SPACING = 0.2;             // setBoundingBoxSpacing(0.2, 0.2)
const HW = SPACING / 2;
const GRAVITY = 0.04;            // vy -= 0.04 * gravityStrength
const VELOCITY_MULT = 0.98;
const COLOR = 0.6;               // BlockDustParticle: red = green = blue = 0.6

// getModelParticleSprite: el modelo de grass_block define "particle": block/dirt
const PARTICLE_TILE: Record<number, T> = {
  [Block.Bedrock]: T.Bedrock, [Block.Dirt]: T.Dirt, [Block.Grass]: T.Dirt,
  [Block.Stone]: T.Stone, [Block.Planks]: T.Planks, [Block.Cobblestone]: T.Cobble,
};

class Particle {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  age = 0;
  maxAge = Math.floor(4 / (Math.random() * 0.9 + 0.1));   // 4..40 ticks
  onGround = false;
  stopped = false;
  dead = false;
  readonly size: number;                                  // semi-lado del quad
  readonly u0: number; readonly v1: number;               // ventana de 1/4 del sprite (muestra al azar)

  constructor(public x: number, public y: number, public z: number, vx: number, vy: number, vz: number, tile: T) {
    this.px = x; this.py = y; this.pz = z;
    // Particle(world,x,y,z,vx,vy,vz): ruido, normalizado y escalado
    vx += (Math.random() * 2 - 1) * 0.4;
    vy += (Math.random() * 2 - 1) * 0.4;
    vz += (Math.random() * 2 - 1) * 0.4;
    const d = (Math.random() + Math.random() + 1) * 0.15;
    const e = Math.hypot(vx, vy, vz) || 1;
    this.vx = vx / e * d * 0.4;
    this.vy = vy / e * d * 0.4 + 0.1;
    this.vz = vz / e * d * 0.4;
    // BillboardParticle.scale = 0.1 * (rand*0.5+0.5) * 2; BlockDustParticle lo divide por 2
    this.size = 0.1 * (Math.random() * 0.5 + 0.5) * 2 / 2;
    const sampleU = Math.random() * 3, sampleV = Math.random() * 3;
    this.u0 = (tile + sampleU / 4) / T.COUNT;
    this.v1 = 1 - sampleV / 4;
  }

  tick(world: World) {
    this.px = this.x; this.py = this.y; this.pz = this.z;
    if (this.age++ >= this.maxAge) { this.dead = true; return; }
    this.vy -= GRAVITY;                       // gravityStrength = 1
    this.move(world, this.vx, this.vy, this.vz);
    this.vx *= VELOCITY_MULT; this.vy *= VELOCITY_MULT; this.vz *= VELOCITY_MULT;
    if (this.onGround) { this.vx *= 0.7; this.vz *= 0.7; }
  }

  /** Particle.move: colisión Y primero, luego X/Z (el eje mayor primero). Al chocar en Y queda `stopped`. */
  private move(world: World, dx: number, dy: number, dz: number) {
    if (this.stopped) return;
    const ox = dx, oy = dy, oz = dz;
    const apply = (axis: 0 | 1 | 2, d: number) => {
      d = clipAxis(world, this.x, this.y, this.z, HW, SPACING, axis, d);
      if (axis === 0) this.x += d; else if (axis === 1) this.y += d; else this.z += d;
      return d;
    };
    dy = apply(1, dy);
    if (Math.abs(dx) < Math.abs(dz)) { dz = apply(2, dz); dx = apply(0, dx); }
    else { dx = apply(0, dx); dz = apply(2, dz); }
    if (Math.abs(oy) >= 1e-5 && Math.abs(dy) < 1e-5) this.stopped = true;
    this.onGround = oy !== dy && oy < 0;
    if (ox !== dx) this.vx = 0;
    if (oz !== dz) this.vz = 0;
  }
}

export class ParticleSystem {
  private list: Particle[] = [];
  private mesh: Mesh;
  private pos = new Float32Array(MAX_PARTICLES * 12);
  private uv = new Float32Array(MAX_PARTICLES * 8);
  private col = new Float32Array(MAX_PARTICLES * 12).fill(COLOR);
  private geo = new BufferGeometry();
  private right = new Vector3();
  private up = new Vector3();

  constructor(scene: Scene, private world: World, atlas: CanvasTexture) {
    const idx = new Uint32Array(MAX_PARTICLES * 6);
    for (let i = 0; i < MAX_PARTICLES; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    this.geo.setAttribute('uv', new BufferAttribute(this.uv, 2).setUsage(35048));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3));
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new Mesh(this.geo, new MeshBasicMaterial({ map: atlas, vertexColors: true, side: DoubleSide }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get count() { return this.list.length; }

  /** addBlockBreakParticles: cubo completo => rejilla 4x4x4 (64 partículas), cada una con velocidad radial. */
  spawnBlockBreak(bx: number, by: number, bz: number, block: Block) {
    const tile = PARTICLE_TILE[block];
    if (tile === undefined) return;
    const n = 4;
    for (let l = 0; l < n; l++)
      for (let m = 0; m < n; m++)
        for (let k = 0; k < n; k++) {
          const g = (l + 0.5) / n, h = (m + 0.5) / n, o = (k + 0.5) / n;
          this.list.push(new Particle(bx + g, by + h, bz + o, g - 0.5, h - 0.5, o - 0.5, tile));
        }
    if (this.list.length > MAX_PARTICLES) this.list.splice(0, this.list.length - MAX_PARTICLES);
  }

  tick() {
    for (const p of this.list) p.tick(this.world);
    this.list = this.list.filter((p) => !p.dead);
  }

  /** Quads orientados a la cámara (BillboardParticle.Rotator.ALL_AXIS), interpolados con tickDelta. */
  render(camera: PerspectiveCamera, alpha: number) {
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const r = this.right, u = this.up;
    let i = 0;
    for (const p of this.list) {
      const cx = p.px + (p.x - p.px) * alpha, cy = p.py + (p.y - p.py) * alpha, cz = p.pz + (p.z - p.pz) * alpha;
      const s = p.size;
      // esquinas (1,-1) (1,1) (-1,1) (-1,-1) como en method_60374
      const corners = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
      const uv0 = p.u0, uv1 = p.u0 + 0.25 / T.COUNT, vTop = p.v1, vBot = p.v1 - 0.25;
      const us = [uv1, uv1, uv0, uv0], vs = [vBot, vTop, vTop, vBot];
      for (let c = 0; c < 4; c++) {
        const [a, b] = corners[c];
        const o = i * 12 + c * 3;
        this.pos[o] = cx + (r.x * a + u.x * b) * s;
        this.pos[o + 1] = cy + (r.y * a + u.y * b) * s;
        this.pos[o + 2] = cz + (r.z * a + u.z * b) * s;
        this.uv[i * 8 + c * 2] = us[c];
        this.uv[i * 8 + c * 2 + 1] = vs[c];
      }
      i++;
    }
    this.geo.setDrawRange(0, i * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
  }
}
