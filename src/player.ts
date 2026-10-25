import { Vector3 } from 'three';
import { clipAxis } from './collision';
import * as C from './constants';
import type { Input } from './input';
import { Block, type World } from './world';

export class Player {
  pos = new Vector3();
  prev = new Vector3();
  vel = new Vector3();
  yaw = 0;    // rad, 0 mira a -Z
  pitch = 0;
  onGround = false;
  sprinting = false;
  sneaking = false;
  hCollision = false;
  eyeHeight = C.EYE_HEIGHT;
  prevEyeHeight = C.EYE_HEIGHT;
  private jumpDelay = 0;
  // Sonidos / caída (Entity.distanceTraveled, nextStepSoundDistance, fallDistance)
  // Bobbing de cámara: Entity.horizontalSpeed / PlayerEntity.strideDistance
  horizontalSpeed = 0;
  prevHorizontalSpeed = 0;
  strideDistance = 0;
  prevStrideDistance = 0;
  private nextStepDistance = 1;
  fallDistance = 0;
  events: { onStep?: (b: Block) => void; onFall?: (damage: number, b: Block) => void } = {};

  constructor(spawn: Vector3) { this.respawn(spawn); }

  respawn(p: Vector3) { this.pos.copy(p); this.prev.copy(p); this.vel.set(0, 0, 0); this.fallDistance = 0; }

  get height() { return this.sneaking ? C.PLAYER_HEIGHT_SNEAK : C.PLAYER_HEIGHT; }

  /** Un tick de juego (50 ms). Orden equivalente a LivingEntity.aiStep + travel. */
  tick(inp: Input, world: World) {
    this.prev.copy(this.pos);
    this.prevHorizontalSpeed = this.horizontalSpeed;
    this.prevStrideDistance = this.strideDistance;
    this.prevEyeHeight = this.eyeHeight;

    const fwd = inp.forward;
    this.sneaking = inp.sneak;
    let zza = fwd, xxa = inp.strafe;
    if (this.sneaking) { zza *= C.SNEAK_MULT; xxa *= C.SNEAK_MULT; }

    if (!this.sprinting && fwd > 0 && !this.sneaking && inp.sprintHeld) this.sprinting = true;
    if (this.sprinting && (fwd <= 0 || this.sneaking || this.hCollision)) this.sprinting = false;

    zza *= C.INPUT_DAMPING; xxa *= C.INPUT_DAMPING;

    const v = this.vel;
    if (Math.abs(v.x) < C.VELOCITY_DEADZONE) v.x = 0;
    if (Math.abs(v.y) < C.VELOCITY_DEADZONE) v.y = 0;
    if (Math.abs(v.z) < C.VELOCITY_DEADZONE) v.z = 0;

    if (this.jumpDelay > 0) this.jumpDelay--;
    if (inp.jump && this.onGround && this.jumpDelay === 0) {
      v.y = C.JUMP_VELOCITY;
      if (this.sprinting) {
        v.x += -Math.sin(this.yaw) * C.SPRINT_JUMP_BOOST;
        v.z += -Math.cos(this.yaw) * C.SPRINT_JUMP_BOOST;
      }
      this.jumpDelay = C.JUMP_COOLDOWN;
    } else if (!inp.jump) this.jumpDelay = 0;

    // travel
    const friction = this.onGround ? C.BLOCK_FRICTION * C.AIR_FRICTION : C.AIR_FRICTION;
    const speed = this.onGround
      ? (this.sprinting ? C.SPRINT_SPEED : C.WALK_SPEED)
      : (this.sprinting ? C.AIR_SPRINT_SPEED : C.AIR_SPEED);
    this.moveRelative(speed, xxa, zza);
    this.move(world, v.x, v.y, v.z);
    v.y = (v.y - C.GRAVITY) * C.DRAG_Y;
    v.x *= friction;
    v.z *= friction;

    // PlayerEntity.tickMovement: strideDistance tiende a min(0.1, |v horizontal|) en el suelo, si no a 0
    const stride = this.onGround ? Math.min(0.1, Math.hypot(v.x, v.z)) : 0;
    this.strideDistance += (stride - this.strideDistance) * 0.4;

    // altura de ojos interpolada (vanilla: 0.5 por tick)
    const targetEye = this.sneaking ? C.EYE_HEIGHT_SNEAK : C.EYE_HEIGHT;
    this.eyeHeight += (targetEye - this.eyeHeight) * 0.5;

    if (this.pos.y < -30) this.respawn(world.spawn);
  }

  private moveRelative(speed: number, strafe: number, forward: number) {
    let l = strafe * strafe + forward * forward;
    if (l < 1e-7) return;
    l = Math.sqrt(l);
    if (l < 1) l = 1;
    const k = speed / l;
    strafe *= k; forward *= k;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    this.vel.x += strafe * c - forward * s;
    this.vel.z += -strafe * s - forward * c;
  }

  private move(world: World, dx: number, dy: number, dz: number) {
    const sx = this.pos.x, sy = this.pos.y, sz = this.pos.z;
    const wasGround = this.onGround;

    // Sneak: no caerse de los bordes (maybeBackOffFromEdge)
    if (this.sneaking && wasGround && this.vel.y <= 0) {
      const step = 0.05;
      while (dx !== 0 && !this.hasSupport(world, dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      while (dz !== 0 && !this.hasSupport(world, 0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      while (dx !== 0 && dz !== 0 && !this.hasSupport(world, dx, dz)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
    }

    const ay = this.sweep(world, 1, dy);
    this.sweep(world, 0, dx);
    this.sweep(world, 2, dz);
    let hit = Math.abs(this.pos.x - sx - dx) > 1e-9 || Math.abs(this.pos.z - sz - dz) > 1e-9;
    const onGroundNow = Math.abs(ay - dy) > 1e-9 && dy < 0;

    // Step-up de 0.6
    if (hit && (wasGround || onGroundNow)) {
      const nx = this.pos.x, ny = this.pos.y, nz = this.pos.z;
      this.pos.set(sx, sy, sz);
      const up = this.sweep(world, 1, C.STEP_HEIGHT);
      this.sweep(world, 0, dx);
      this.sweep(world, 2, dz);
      this.sweep(world, 1, -up);
      const dStep = (this.pos.x - sx) ** 2 + (this.pos.z - sz) ** 2;
      const dNorm = (nx - sx) ** 2 + (nz - sz) ** 2;
      if (dStep <= dNorm + 1e-9) this.pos.set(nx, ny, nz);
      hit = Math.abs(this.pos.x - sx - dx) > 1e-9 || Math.abs(this.pos.z - sz - dz) > 1e-9;
    }

    this.hCollision = hit;
    this.onGround = onGroundNow;
    this.afterMove(world, this.pos.x - sx, this.pos.y - sy, this.pos.z - sz);
    if (Math.abs(this.pos.x - sx - dx) > 1e-9) this.vel.x = 0;
    if (Math.abs(this.pos.z - sz - dz) > 1e-9) this.vel.z = 0;
    if (Math.abs(ay - dy) > 1e-9) this.vel.y = 0;
  }

  /** Vanilla: la caja desplazada (dx, -stepHeight, dz) debe chocar con algo para que haya suelo. */
  /** Entity.fall + parte de sonidos de Entity.move. */
  private afterMove(world: World, mx: number, my: number, mz: number) {
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y - 0.2), bz = Math.floor(this.pos.z);
    const below = world.get(bx, by, bz);

    // Caída: daño = ceil(fallDistance - 3); con daño > 0 suenan fall del jugador + fall del bloque
    if (this.onGround) {
      if (this.fallDistance > 0) {
        const dmg = Math.ceil(this.fallDistance - 3);
        if (dmg > 0 && below !== Block.Air) this.events.onFall?.(dmg, below);
      }
      this.fallDistance = 0;
    } else if (my < 0) this.fallDistance -= my;

    // Pasos: MoveEffect.NONE si estás en el suelo agachado. Solo cuenta distancia horizontal.
    if (this.onGround && this.sneaking) return;
    this.horizontalSpeed += Math.hypot(mx, mz) * 0.6;
    if (this.horizontalSpeed > this.nextStepDistance && below !== Block.Air && this.onGround) {
      this.events.onStep?.(below);
      this.nextStepDistance = Math.floor(this.horizontalSpeed) + 1;
    }
  }

  private hasSupport(world: World, dx: number, dz: number) {
    const hw = C.PLAYER_WIDTH / 2, x = this.pos.x + dx, z = this.pos.z + dz, y = this.pos.y - C.STEP_HEIGHT;
    return world.boxHits(x - hw, y, z - hw, x + hw, y + this.height, z + hw);
  }

  /** Mueve en un eje contra los bloques; devuelve el desplazamiento real. */
  private sweep(world: World, axis: 0 | 1 | 2, d: number): number {
    d = clipAxis(world, this.pos.x, this.pos.y, this.pos.z, C.PLAYER_WIDTH / 2, this.height, axis, d);
    if (axis === 0) this.pos.x += d; else if (axis === 1) this.pos.y += d; else this.pos.z += d;
    return d;
  }
}
