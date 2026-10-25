import {
  BoxGeometry, Color, EdgesGeometry, Fog, LineBasicMaterial, LineSegments, Matrix4, PerspectiveCamera, Scene,
  Vector3, WebGLRenderer,
} from 'three';
import * as C from './constants';
import { Input } from './input';
import { Player } from './player';
import { SoundSystem } from './audio';
import { ParticleSystem } from './particles';
import { BLOCK_SOUNDS } from './sounds';
import { buildAtlas, ChunkRenderer, HOTBAR } from './renderer';
import { Block, World } from './world';

const SKY = new Color(0x78a7ff);

async function main() {
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = SKY;
  scene.fog = new Fog(SKY, 70, 125);

  const camera = new PerspectiveCamera(C.BASE_FOV, innerWidth / innerHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';
  camera.matrixAutoUpdate = false; // la matriz se arma a mano para sumar el bobbing
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  const world = new World(8);
  const atlas = await buildAtlas();
  const chunks = new ChunkRenderer(scene, world, atlas);
  const particles = new ParticleSystem(scene, world, atlas);
  const player = new Player(world.spawn);
  const input = new Input();

  // Sonidos (valores de volumen/pitch tomados del código fuente 1.21.1)
  const audio = new SoundSystem();
  void audio.load();
  player.events.onStep = (b) => {            // Entity.playStepSound: vol * 0.15
    const g = BLOCK_SOUNDS[b];
    audio.play(g.step, g.volume * 0.15, g.pitch);
  };
  player.events.onFall = (dmg, b) => {       // LivingEntity.handleFallDamage + playBlockFallSound
    audio.play(dmg > 4 ? 'entity.player.big_fall' : 'entity.player.small_fall', 1, 1);
    const g = BLOCK_SOUNDS[b];
    audio.play(g.fall, g.volume * 0.5, g.pitch * 0.75);
  };
  const blockCenter = (x: number, y: number, z: number) => new Vector3(x + 0.5, y + 0.5, z + 0.5);

  // Selección de bloque apuntado
  const outline = new LineSegments(new EdgesGeometry(new BoxGeometry(1.004, 1.004, 1.004)), new LineBasicMaterial({ color: 0x000000 }));
  outline.visible = false;
  scene.add(outline);

  // Hotbar
  let selected = 0;
  const hotbar = document.getElementById('hotbar')!;
  const slots = HOTBAR.map((h, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    el.textContent = `${i + 1} ${h.name}`;
    hotbar.appendChild(el);
    return el;
  });
  const select = (i: number) => { selected = i; slots.forEach((s, k) => s.classList.toggle('sel', k === i)); };
  select(0);
  addEventListener('keydown', (e) => {
    const n = parseInt(e.key);
    if (n >= 1 && n <= HOTBAR.length) select(n - 1);
    if (e.code === 'F3') { const d = document.getElementById('debug')!; d.style.display = d.style.display === 'block' ? 'none' : 'block'; }
  });

  // Pointer lock
  const overlay = document.getElementById('overlay')!;
  overlay.addEventListener('click', () => { audio.resume(); renderer.domElement.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => overlay.classList.toggle('hidden', !!document.pointerLockElement));
  addEventListener('contextmenu', (e) => e.preventDefault());

  // GameRenderer.bobView (1.21.1). Se aplica en espacio de vista: view' = B * V  =>  cámara' = cámara * B^-1
  let bobbing = true;
  addEventListener('keydown', (e) => { if (e.code === 'KeyB' && !e.repeat) bobbing = !bobbing; });
  const bob = new Matrix4(), rot = new Matrix4();
  const applyBobbing = (alpha: number) => {
    camera.updateMatrix();
    if (bobbing) {
      const f = player.horizontalSpeed - player.prevHorizontalSpeed;
      const g = -(player.horizontalSpeed + f * alpha);
      const h = player.prevStrideDistance + (player.strideDistance - player.prevStrideDistance) * alpha;
      const s = Math.sin(g * Math.PI), c = Math.cos(g * Math.PI);
      const D = Math.PI / 180;
      bob.makeTranslation(s * h * 0.5, -Math.abs(c * h), 0);
      bob.multiply(rot.makeRotationZ(s * h * 3 * D));
      bob.multiply(rot.makeRotationX(Math.abs(Math.cos(g * Math.PI - 0.2) * h) * 5 * D));
      camera.matrix.multiply(bob.invert());
    }
    camera.matrixWorldNeedsUpdate = true;
  };

  const lookDir = new Vector3();
  const eyePos = new Vector3();
  const getEye = (alpha: number) => {
    eyePos.lerpVectors(player.prev, player.pos, alpha);
    eyePos.y += player.prevEyeHeight + (player.eyeHeight - player.prevEyeHeight) * alpha;
    return eyePos;
  };
  const getLook = () => lookDir.set(
    -Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch),
  );

  addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement) return;
    const hit = world.raycast(getEye(1).clone(), getLook().clone(), C.REACH);
    if (!hit) return;
    const [x, y, z] = hit.pos;
    if (e.button === 0) {
      const b = world.get(x, y, z);
      if (b !== Block.Bedrock) {
        world.set(x, y, z, Block.Air);
        particles.spawnBlockBreak(x, y, z, b);
        const g = BLOCK_SOUNDS[b];           // WorldRenderer case 2001: (vol+1)/2, pitch*0.8
        audio.play(g.break, (g.volume + 1) / 2, g.pitch * 0.8, blockCenter(x, y, z));
      }
    } else if (e.button === 2) {
      const px = x + hit.normal[0], py = y + hit.normal[1], pz = z + hit.normal[2];
      const hw = C.PLAYER_WIDTH / 2, p = player.pos;
      const overlaps = px < p.x + hw && px + 1 > p.x - hw && pz < p.z + hw && pz + 1 > p.z - hw
        && py < p.y + player.height && py + 1 > p.y;
      if (!overlaps) {
        const nb = HOTBAR[selected].block;
        world.set(px, py, pz, nb);
        const g = BLOCK_SOUNDS[nb];          // BlockItem.place: (vol+1)/2, pitch*0.8
        audio.play(g.place, (g.volume + 1) / 2, g.pitch * 0.8, blockCenter(px, py, pz));
      }
    }
  });

  // Loop: ticks fijos de 50 ms + render interpolado
  let acc = 0, last = performance.now(), fov = C.BASE_FOV, prevFov = fov, fps = 0, frames = 0, fpsT = last;
  const debug = document.getElementById('debug')!;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 250);
    last = now;

    // Mouse (inmediato, no por tick)
    player.yaw -= input.mouseDX * C.MOUSE_DEG_PER_PX * Math.PI / 180;
    player.pitch -= input.mouseDY * C.MOUSE_DEG_PER_PX * Math.PI / 180;
    player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
    input.mouseDX = input.mouseDY = 0;

    while (acc >= C.TICK_MS) {
      acc -= C.TICK_MS;
      player.tick(input, world);
      particles.tick();
      prevFov = fov;
      const target = C.BASE_FOV * (player.sprinting ? C.SPRINT_FOV_MULT : 1);
      fov += (target - fov) * 0.5;
    }
    const alpha = acc / C.TICK_MS;

    chunks.update();
    camera.position.copy(getEye(alpha));
    camera.rotation.set(player.pitch, player.yaw, 0);
    applyBobbing(alpha);
    audio.setListener(camera.position, getLook());
    camera.fov = prevFov + (fov - prevFov) * alpha;
    camera.updateProjectionMatrix();

    const hit = document.pointerLockElement ? world.raycast(camera.position, getLook(), C.REACH) : null;
    outline.visible = !!hit;
    if (hit) outline.position.set(hit.pos[0] + 0.5, hit.pos[1] + 0.5, hit.pos[2] + 0.5);

    particles.render(camera, alpha);
    renderer.render(scene, camera);

    frames++;
    if (now - fpsT > 500) {
      fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now;
      if (debug.style.display === 'block') {
        const bps = Math.hypot(player.pos.x - player.prev.x, player.pos.z - player.prev.z) * C.TPS;
        debug.textContent =
          `${fps} fps\n` +
          `XYZ: ${player.pos.x.toFixed(3)} / ${player.pos.y.toFixed(3)} / ${player.pos.z.toFixed(3)}\n` +
          `Vel: ${player.vel.x.toFixed(3)} / ${player.vel.y.toFixed(3)} / ${player.vel.z.toFixed(3)} b/tick\n` +
          `Velocidad horizontal: ${bps.toFixed(2)} b/s\n` +
          `onGround: ${player.onGround}  sprint: ${player.sprinting}  sneak: ${player.sneaking}\n` +
          `Partículas: ${particles.count}  Bobbing (B): ${bobbing ? 'on' : 'off'}\n` +
          `FOV: ${camera.fov.toFixed(1)}  Yaw/Pitch: ${(player.yaw * 180 / Math.PI).toFixed(1)} / ${(player.pitch * 180 / Math.PI).toFixed(1)}`;
      }
    }
  };
  requestAnimationFrame(frame);
}

main();
