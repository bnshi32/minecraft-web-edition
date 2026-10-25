import { Vector3 } from 'three';
import { SOUND_EVENTS } from './sounds';

const MASTER_VOLUME = 1.0;

export class SoundSystem {
  private ctx = new AudioContext();
  private master = this.ctx.createGain();
  private buffers = new Map<string, AudioBuffer>();

  constructor() {
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.ctx.destination);
  }

  /** Llamar desde un gesto del usuario (click) por la política de autoplay. */
  resume() { if (this.ctx.state !== 'running') void this.ctx.resume(); }

  async load() {
    const files = [...new Set(Object.values(SOUND_EVENTS).flat())];
    await Promise.all(files.map(async (f) => {
      try {
        const res = await fetch(`/sounds/${f}.ogg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.buffers.set(f, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (e) {
        console.warn(`[audio] no se pudo cargar ${f}:`, e);
      }
    }));
  }

  setListener(pos: Vector3, forward: Vector3) {
    const l = this.ctx.listener;
    if (!l.positionX) return;
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  }

  /** Equivalente a World.playSound: variante al azar, volumen y pitch (playbackRate). `at` = posición 3D. */
  play(event: string, volume: number, pitch: number, at?: Vector3) {
    const files = SOUND_EVENTS[event];
    if (!files) return;
    const buf = this.buffers.get(files[Math.floor(Math.random() * files.length)]);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.min(2, Math.max(0.5, pitch));
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    if (at) {
      // Atenuación lineal de Minecraft: 0 a 16 bloques (x volumen si > 1)
      const panner = new PannerNode(this.ctx, {
        panningModel: 'equalpower', distanceModel: 'linear',
        refDistance: 0, maxDistance: 16 * Math.max(1, volume), rolloffFactor: 1,
        positionX: at.x, positionY: at.y, positionZ: at.z,
      });
      gain.connect(panner).connect(this.master);
    } else gain.connect(this.master);
    src.start();
  }
}
