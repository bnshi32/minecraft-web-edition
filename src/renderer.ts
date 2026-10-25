import {
  BufferAttribute, BufferGeometry, CanvasTexture, Mesh, MeshBasicMaterial, NearestFilter, Scene, SRGBColorSpace,
} from 'three';
import { Block, CHUNK_SIZE, WORLD_HEIGHT, World } from './world';

// Tiles del atlas
export enum T { Bedrock, Dirt, GrassTop, GrassSide, Stone, Planks, Cobble, COUNT }
const FALLBACK = ['#555', '#866043', '#5fa03a', '#7a8a4a', '#7d7d7d', '#9c7f4e', '#6e6e6e'];
const FILES: Record<number, string> = {
  [T.Bedrock]: 'bedrock', [T.Dirt]: 'dirt', [T.GrassTop]: 'grass_block_top', [T.GrassSide]: 'grass_block_side',
  [T.Stone]: 'stone', [T.Planks]: 'oak_planks', [T.Cobble]: 'cobblestone',
};
const GRASS_TINT = '#91BD59'; // bioma plains

// [arriba, abajo, lados]
const BLOCK_TILES: Record<number, [T, T, T]> = {
  [Block.Bedrock]: [T.Bedrock, T.Bedrock, T.Bedrock],
  [Block.Dirt]: [T.Dirt, T.Dirt, T.Dirt],
  [Block.Grass]: [T.GrassTop, T.Dirt, T.GrassSide],
  [Block.Stone]: [T.Stone, T.Stone, T.Stone],
  [Block.Planks]: [T.Planks, T.Planks, T.Planks],
  [Block.Cobblestone]: [T.Cobble, T.Cobble, T.Cobble],
};

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => res(null);
  i.src = src;
});

function tint(img: HTMLImageElement, color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, 16, 16);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, 16, 16);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0, 16, 16);
  return c;
}

export async function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = T.COUNT * 16;
  canvas.height = 16;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const base = '/textures/blocks/';
  const overlay = await loadImg(`${base}grass_block_side_overlay.png`);
  for (let t = 0; t < T.COUNT; t++) {
    const img = await loadImg(`${base}${FILES[t]}.png`);
    if (!img) { g.fillStyle = FALLBACK[t]; g.fillRect(t * 16, 0, 16, 16); continue; }
    if (t === T.GrassTop) g.drawImage(tint(img, GRASS_TINT), t * 16, 0);
    else {
      g.drawImage(img, t * 16, 0, 16, 16);
      if (t === T.GrassSide && overlay) g.drawImage(tint(overlay, GRASS_TINT), t * 16, 0);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Caras: vértices CCW vistos desde afuera. dir, shade, vértices, tipo (0=top 1=bottom 2=side)
const FACES = [
  { d: [1, 0, 0], s: 0.6, k: 2, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { d: [-1, 0, 0], s: 0.6, k: 2, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { d: [0, 1, 0], s: 1.0, k: 0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { d: [0, -1, 0], s: 0.5, k: 1, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { d: [0, 0, 1], s: 0.8, k: 2, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { d: [0, 0, -1], s: 0.8, k: 2, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
] as const;
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];

export class ChunkRenderer {
  private meshes = new Map<string, Mesh>();
  private material: MeshBasicMaterial;

  constructor(private scene: Scene, private world: World, atlas: CanvasTexture) {
    this.material = new MeshBasicMaterial({ map: atlas, vertexColors: true });
  }

  /** Reconstruye chunks sucios (máx. `budget` por frame). */
  update(budget = 8) {
    let n = 0;
    for (const key of this.world.dirty) {
      this.world.dirty.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      this.build(key, cx, cz);
      if (++n >= budget) break;
    }
  }

  private build(key: string, cx: number, cz: number) {
    const w = this.world;
    if (!w.chunks.has(key)) return;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], ind: number[] = [];
    const ox = cx * CHUNK_SIZE, oz = cz * CHUNK_SIZE;
    for (let y = 0; y < WORLD_HEIGHT; y++)
      for (let lz = 0; lz < CHUNK_SIZE; lz++)
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const x = ox + lx, z = oz + lz;
          const b = w.get(x, y, z);
          if (b === Block.Air) continue;
          const tiles = BLOCK_TILES[b];
          for (const f of FACES) {
            if (w.isSolid(x + f.d[0], y + f.d[1], z + f.d[2])) continue;
            const tile = tiles[f.k];
            const vi = pos.length / 3;
            for (let i = 0; i < 4; i++) {
              pos.push(x + f.v[i][0], y + f.v[i][1], z + f.v[i][2]);
              uv.push((tile + UVS[i][0]) / T.COUNT, UVS[i][1]);
              col.push(f.s, f.s, f.s);
            }
            ind.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          }
        }
    const old = this.meshes.get(key);
    if (old) { this.scene.remove(old); old.geometry.dispose(); this.meshes.delete(key); }
    if (!ind.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(ind);
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.material);
    this.meshes.set(key, mesh);
    this.scene.add(mesh);
  }
}

export const HOTBAR: { block: Block; name: string }[] = [
  { block: Block.Grass, name: 'Grass' },
  { block: Block.Dirt, name: 'Dirt' },
  { block: Block.Stone, name: 'Stone' },
  { block: Block.Planks, name: 'Planks' },
  { block: Block.Cobblestone, name: 'Cobble' },
];
