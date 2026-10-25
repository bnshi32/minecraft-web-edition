import type { World } from './world';

const E = 1e-7;

/**
 * Barrido de una AABB (centrada en X/Z, y = base) contra los bloques en un solo eje.
 * Devuelve el desplazamiento permitido. Lo usan el player y las partículas.
 */
export function clipAxis(
  world: World, px: number, py: number, pz: number, hw: number, h: number, axis: 0 | 1 | 2, d: number,
): number {
  if (d === 0) return 0;
  const min = [px - hw, py, pz - hw];
  const max = [px + hw, py + h, pz + hw];
  const lo = min.map((v, i) => Math.floor(i === axis && d < 0 ? v + d : v));
  const hi = max.map((v, i) => Math.floor(i === axis && d > 0 ? v + d : v));
  for (let x = lo[0]; x <= hi[0]; x++)
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let z = lo[2]; z <= hi[2]; z++) {
        if (!world.isSolid(x, y, z)) continue;
        const b = [x, y, z];
        let overlap = true;
        for (let o = 0; o < 3; o++) {
          if (o === axis) continue;
          if (!(max[o] > b[o] + E && min[o] < b[o] + 1 - E)) { overlap = false; break; }
        }
        if (!overlap) continue;
        if (d > 0 && max[axis] <= b[axis] + E) d = Math.min(d, b[axis] - max[axis]);
        else if (d < 0 && min[axis] >= b[axis] + 1 - E) d = Math.max(d, b[axis] + 1 - min[axis]);
      }
  return d;
}
