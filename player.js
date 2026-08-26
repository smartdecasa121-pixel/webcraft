// ============================================================
// player.js - Todo lo relacionado al jugador:
//  - Cámara en primera persona controlada con Pointer Lock
//  - Movimiento WASD + salto + gravedad
//  - Colisión simple contra los bloques del mundo (AABB)
//  - Raycasting tipo "voxel DDA" para saber a qué bloque
//    apunta la mira, usado para romper/colocar bloques
// ============================================================
import * as THREE from 'three';
import { isSolid } from './blocks.js';

const GRAVITY = -28;
const JUMP_SPEED = 9;
const WALK_SPEED = 5.4;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.62;

export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;

    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;

    this.yaw = 0;   // rotación horizontal (izquierda/derecha)
    this.pitch = 0; // rotación vertical (arriba/abajo)

    this.keys = {};
    this.isLocked = false;

    this._setupPointerLock();
    this._setupKeyboard();
  }

  // ---------- Pointer Lock (para poder mirar con el mouse como en un FPS) ----------
  _setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) this.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      const limit = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // ---------- Colisión simple contra el mundo ----------
  // Comprueba si una caja (AABB) centrada en (x,y,z) con las medidas del
  // jugador choca contra algún bloque sólido.
  _collides(x, y, z) {
    const minX = Math.floor(x - PLAYER_RADIUS);
    const maxX = Math.floor(x + PLAYER_RADIUS);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + PLAYER_HEIGHT);
    const minZ = Math.floor(z - PLAYER_RADIUS);
    const maxZ = Math.floor(z + PLAYER_RADIUS);

    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (isSolid(this.world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05); // clamp para evitar saltos raros si el tab pierde foco

    // --- Dirección de movimiento según hacia dónde miramos (solo yaw) ---
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    let moveX = 0, moveZ = 0;
    if (this.keys['KeyW']) { moveX += forward.x; moveZ += forward.z; }
    if (this.keys['KeyS']) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.keys['KeyD']) { moveX += right.x; moveZ += right.z; }
    if (this.keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) { moveX /= len; moveZ /= len; }

    this.velocity.x = moveX * WALK_SPEED;
    this.velocity.z = moveZ * WALK_SPEED;

    // --- Salto y gravedad ---
    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y += GRAVITY * dt;

    // --- Mover con colisión por eje (así al chocar con una pared no se frena en Y) ---
    const next = this.position.clone();

    next.x += this.velocity.x * dt;
    if (this._collides(next.x, this.position.y, this.position.z)) next.x = this.position.x;

    next.z += this.velocity.z * dt;
    if (this._collides(next.x, this.position.y, next.z)) next.z = this.position.z;

    next.y += this.velocity.y * dt;
    if (this._collides(next.x, next.y, next.z)) {
      if (this.velocity.y < 0) this.onGround = true;
      this.velocity.y = 0;
      next.y = this.position.y;
    } else {
      this.onGround = false;
    }

    this.position.copy(next);

    // --- Aplicar a la cámara ---
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  respawnAt(x, z) {
    const y = this.world.getSpawnHeight(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
  }

  // ---------------------------------------------------------
  // Raycasting voxel (algoritmo DDA de Amanatides & Woo).
  // Devuelve el primer bloque sólido que "toca" el rayo desde
  // la cámara, junto con la celda vacía justo antes (para saber
  // dónde colocar un bloque nuevo) y la normal de la cara.
  // ---------------------------------------------------------
  raycastBlock(maxDistance = 6) {
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    const boundX = stepX > 0 ? (x + 1 - origin.x) : (origin.x - x);
    const boundY = stepY > 0 ? (y + 1 - origin.y) : (origin.y - y);
    const boundZ = stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z);

    let tMaxX = dir.x !== 0 ? boundX / Math.abs(dir.x) : Infinity;
    let tMaxY = dir.y !== 0 ? boundY / Math.abs(dir.y) : Infinity;
    let tMaxZ = dir.z !== 0 ? boundZ / Math.abs(dir.z) : Infinity;

    let normal = new THREE.Vector3(0, 0, 0);
    let traveled = 0;

    while (traveled < maxDistance) {
      const block = this.world.getBlock(x, y, z);
      if (isSolid(block)) {
        return {
          position: new THREE.Vector3(x, y, z),
          previousPosition: new THREE.Vector3(x - normal.x, y - normal.y, z - normal.z),
          normal: normal.clone(),
          blockId: block,
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; traveled = tMaxX; tMaxX += tDeltaX; normal.set(-stepX, 0, 0);
      } else if (tMaxY < tMaxZ) {
        y += stepY; traveled = tMaxY; tMaxY += tDeltaY; normal.set(0, -stepY, 0);
      } else {
        z += stepZ; traveled = tMaxZ; tMaxZ += tDeltaZ; normal.set(0, 0, -stepZ);
      }
    }

    return null; // no se encontró ningún bloque en rango
  }
}
