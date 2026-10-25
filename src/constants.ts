// Física de Java Edition. Unidades: bloques, ticks (20 TPS).
export const TPS = 20;
export const TICK_MS = 1000 / TPS;

export const GRAVITY = 0.08;          // blocks/tick^2
export const DRAG_Y = 0.98;           // vy = (vy - gravity) * 0.98
export const AIR_FRICTION = 0.91;     // horizontal en el aire
export const BLOCK_FRICTION = 0.6;    // todos los bloques normales (hielo = 0.98)
export const JUMP_VELOCITY = 0.42;
export const JUMP_COOLDOWN = 10;      // ticks si mantenés espacio
export const SPRINT_JUMP_BOOST = 0.2;

export const WALK_SPEED = 0.1;        // atributo movement_speed
export const SPRINT_SPEED = 0.13;     // +30%
export const AIR_SPEED = 0.02;
export const AIR_SPRINT_SPEED = 0.026;
export const SNEAK_MULT = 0.3;
export const INPUT_DAMPING = 0.98;
export const VELOCITY_DEADZONE = 0.003;
export const STEP_HEIGHT = 0.6;

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_HEIGHT_SNEAK = 1.5;
export const EYE_HEIGHT = 1.62;
export const EYE_HEIGHT_SNEAK = 1.27;

export const BASE_FOV = 70;           // vertical, valor por defecto
export const SPRINT_FOV_MULT = 1.15;  // (0.13/0.1 + 1) / 2
export const MOUSE_DEG_PER_PX = 0.15; // sensibilidad 100%
export const REACH = 4.5;
