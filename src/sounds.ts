// Réplica de net.minecraft.sound.BlockSoundGroup (1.21.1) + eventos de sounds.json -> archivos .ogg
import { Block } from './world';

export interface BlockSoundGroup {
  volume: number; pitch: number;
  break: string; step: string; place: string; hit: string; fall: string;
}

const group = (name: string, volume = 1, pitch = 1): BlockSoundGroup => ({
  volume, pitch,
  break: `block.${name}.break`, step: `block.${name}.step`, place: `block.${name}.place`,
  hit: `block.${name}.hit`, fall: `block.${name}.fall`,
});

export const GRASS = group('grass');
export const GRAVEL = group('gravel');
export const STONE = group('stone');
export const WOOD = group('wood');

// Blocks.java: dirt = GRAVEL, grass_block = GRASS, oak_planks = WOOD, resto = STONE (default de Settings)
export const BLOCK_SOUNDS: Record<number, BlockSoundGroup> = {
  [Block.Bedrock]: STONE,
  [Block.Dirt]: GRAVEL,
  [Block.Grass]: GRASS,
  [Block.Stone]: STONE,
  [Block.Planks]: WOOD,
  [Block.Cobblestone]: STONE,
};

const n = (p: string, c: number) => Array.from({ length: c }, (_, i) => `${p}${i + 1}`);

// sounds.json: step/hit/fall usan los archivos "step/*"; break/place usan "dig/*"
function blockEvents(name: string, steps: number, digs: number): Record<string, string[]> {
  const step = n(`step/${name}`, steps), dig = n(`dig/${name}`, digs);
  return {
    [`block.${name}.step`]: step, [`block.${name}.hit`]: step, [`block.${name}.fall`]: step,
    [`block.${name}.break`]: dig, [`block.${name}.place`]: dig,
  };
}

export const SOUND_EVENTS: Record<string, string[]> = {
  ...blockEvents('grass', 6, 4),
  ...blockEvents('gravel', 4, 4),
  ...blockEvents('stone', 6, 4),
  ...blockEvents('wood', 6, 4),
  'entity.player.small_fall': ['damage/fallsmall'],
  'entity.player.big_fall': ['damage/fallbig'],
};
