// Descarga texturas (PrismarineJS/minecraft-assets) y sonidos .ogg (InventivetalentDev/minecraft-assets), ambos 1.21.1
// Nunca falla el install: si no hay red, el juego usa colores planos de reemplazo.
import { mkdir, writeFile, access } from 'node:fs/promises';

const BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.1/blocks';
const OUT = new URL('../public/textures/blocks/', import.meta.url);
const FILES = [
  'bedrock', 'dirt', 'grass_block_top', 'grass_block_side', 'grass_block_side_overlay',
  'stone', 'oak_planks', 'cobblestone',
];

const SOUND_BASE = 'https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.1/assets/minecraft/sounds';
const SOUND_OUT = new URL('../public/sounds/', import.meta.url);
const n = (p, c) => Array.from({ length: c }, (_, i) => `${p}${i + 1}`);
const SOUNDS = [
  ...n('step/grass', 6), ...n('dig/grass', 4),
  ...n('step/gravel', 4), ...n('dig/gravel', 4),
  ...n('step/stone', 6), ...n('dig/stone', 4),
  ...n('step/wood', 6), ...n('dig/wood', 4),
  'damage/fallsmall', 'damage/fallbig',
];

await mkdir(OUT, { recursive: true });
let ok = 0;
for (const name of FILES) {
  const file = new URL(`${name}.png`, OUT);
  try { await access(file); ok++; continue; } catch { /* no existe, descargar */ }
  try {
    const res = await fetch(`${BASE}/${name}.png`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) {
    console.warn(`[assets] no se pudo bajar ${name}: ${e.message}`);
  }
}
console.log(`[assets] ${ok}/${FILES.length} texturas listas`);

let sok = 0;
for (const name of SOUNDS) {
  const file = new URL(`${name}.ogg`, SOUND_OUT);
  try { await access(file); sok++; continue; } catch { /* descargar */ }
  try {
    const res = await fetch(`${SOUND_BASE}/${name}.ogg`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await mkdir(new URL('./', file), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    sok++;
  } catch (e) {
    console.warn(`[assets] no se pudo bajar sonido ${name}: ${e.message}`);
  }
}
console.log(`[assets] ${sok}/${SOUNDS.length} sonidos listos`);
