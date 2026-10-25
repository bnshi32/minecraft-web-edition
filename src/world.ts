import { Vector3 } from 'three';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;

export enum Block { Air, Bedrock, Dirt, Grass, Stone, Planks, Cobblestone }

export interface RayHit { pos: [number, number, number]; normal: [number, number, number]; }

const idx = (x: number, y: number, z: number) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;

export class World {
  readonly chunks = new Map<string, Uint8Array>();
  readonly dirty = new Set<string>();
  readonly spawn = new Vector3(0.5, 4, 0.5);

  /** Mundo cuadrado de (2*radius)^2 chunks. */
  constructor(readonly radius = 8) {
    for (let cx = -radius; cx < radius; cx++)
      for (let cz = -radius; cz < radius; cz++) this.generateFlat(cx, cz);
  }

  static key(cx: number, cz: number) { return `${cx},${cz}`; }

  // Superplano clásico: bedrock, 2 dirt, 1 grass (superficie en y=4)
  private generateFlat(cx: number, cz: number) {
    const d = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    for (let x = 0; x < CHUNK_SIZE; x++)
      for (let z = 0; z < CHUNK_SIZE; z++) {
        d[idx(x, 0, z)] = Block.Bedrock;
        d[idx(x, 1, z)] = Block.Dirt;
        d[idx(x, 2, z)] = Block.Dirt;
        d[idx(x, 3, z)] = Block.Grass;
      }
    const k = World.key(cx, cz);
    this.chunks.set(k, d);
    this.dirty.add(k);
  }

  get(x: number, y: number, z: number): Block {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(World.key(cx, cz));
    if (!c) return Block.Air;
    return c[idx(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] as Block;
  }

  set(x: number, y: number, z: number, b: Block) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(World.key(cx, cz));
    if (!c) return;
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    c[idx(lx, y, lz)] = b;
    this.dirty.add(World.key(cx, cz));
    if (lx === 0) this.dirty.add(World.key(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirty.add(World.key(cx + 1, cz));
    if (lz === 0) this.dirty.add(World.key(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirty.add(World.key(cx, cz + 1));
  }

  isSolid(x: number, y: number, z: number) { return this.get(x, y, z) !== Block.Air; }

  /** ¿La caja [min,max] toca algún bloque sólido? */
  boxHits(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    const e = 1e-7;
    for (let x = Math.floor(minX + e); x <= Math.floor(maxX - e); x++)
      for (let y = Math.floor(minY + e); y <= Math.floor(maxY - e); y++)
        for (let z = Math.floor(minZ + e); z <= Math.floor(maxZ - e); z++)
          if (this.isSolid(x, y, z)) return true;
    return false;
  }

  /** DDA (Amanatides & Woo). */
  raycast(o: Vector3, d: Vector3, max: number): RayHit | null {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity;
    const tdy = sy ? Math.abs(1 / d.y) : Infinity;
    const tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let ty = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    const n: [number, number, number] = [0, 0, 0];
    for (;;) {
      if (this.isSolid(x, y, z)) return { pos: [x, y, z], normal: [n[0], n[1], n[2]] };
      if (tx <= ty && tx <= tz) { if (tx > max) return null; x += sx; tx += tdx; n[0] = -sx; n[1] = 0; n[2] = 0; }
      else if (ty <= tz) { if (ty > max) return null; y += sy; ty += tdy; n[0] = 0; n[1] = -sy; n[2] = 0; }
      else { if (tz > max) return null; z += sz; tz += tdz; n[0] = 0; n[1] = 0; n[2] = -sz; }
    }
  }
}
