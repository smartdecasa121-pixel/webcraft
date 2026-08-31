// ============================================================
// player.js - Todo lo relacionado al jugador:
//  - Cámara en primera persona (Pointer Lock en PC, touch en
//    celular/tablet vía look() expuesto)
//  - Movimiento WASD + salto + gravedad
//  - Colisión simple contra los bloques del mundo (AABB)
//  - Raycasting tipo "voxel DDA" para romper/colocar bloques
//  - Vida y daño por caída (solo en modo Supervivencia)
// ============================================================
import * as THREE from 'three';
import { isSolid } from './blocks.js';

const GRAVITY = -28;
const JUMP_SPEED = 9;
const WALK_SPEED = 5.4;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.62;
const SAFE_FALL_BLOCKS = 3; // hasta esta altura de caída no duele, como en Minecraft
const MAX_HEALTH = 20;      // 20 = 10 corazones (cada corazón = 2 de vida)

export class Player {
  constructor(camera, domElement, world, mode = 'creative') {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.mode = mode; // 'creative' | 'survival'

    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.onGround = false;
    this._wasOnGround = true;
    this._peakY = null; // altura más alta alcanzada mientras está en el aire (para daño por caída)

    this.yaw = 0;
    this.pitch = 0;

    this.health = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.isDead = false;

    // Callbacks que main.js puede engachar
    this.onHealthChange = null; // (health, maxHealth) => {}
    this.onDeath = null;        // () => {}

    this.keys = {};
    this.isLocked = false;

    this._setupPointerLock();
    this._setupKeyboard();
    this._setupReliability();
  }

  // ---------- Pointer Lock (mouse-look en PC) ----------
  _setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) this.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    // Si el navegador rechaza el pointer lock (pasa a veces en el primer click),
    // no rompemos nada: el usuario puede volver a clickear.
    document.addEventListener('pointerlockerror', () => {
      this.isLocked = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.look(e.movementX, e.movementY, 0.0022);
    });
  }

  // Rotar la cámara. Lo usan tanto el mouse (PC) como el touch (celular/tablet).
  look(dx, dy, sensitivity = 0.0035) {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    const limit = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  // ---------------------------------------------------------
  // Fixes de confiabilidad: si la pestaña/ventana pierde el foco
  // (alt-tab, cambiar de app, abrir devtools) las teclas pueden
  // quedar "trabadas" en `true` porque nunca llega el keyup.
  // Reseteamos todo al perder el foco para que el player no siga
  // caminando solo.
  // ---------------------------------------------------------
  _setupReliability() {
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.keys = {};
    });
  }

  // ---------- Colisión simple contra el mundo ----------
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
    if (this.isDead) return; // congelado mientras se muestra la pantalla de muerte
    dt = Math.min(dt, 0.05);

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

    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y += GRAVITY * dt;

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

    // --- Seguimiento de caída libre para calcular daño al aterrizar ---
    if (!this.onGround) {
      if (this._peakY === null || this.position.y > this._peakY) this._peakY = this.position.y;
    }
    if (this.onGround && !this._wasOnGround) {
      if (this._peakY !== null) {
        const fallDistance = this._peakY - this.position.y;
        this._applyFallDamage(fallDistance);
      }
      this._peakY = null;
    }
    this._wasOnGround = this.onGround;

    // --- Aplicar a la cámara ---
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _applyFallDamage(fallDistance) {
    if (this.mode !== 'survival') return; // en creativo no hay daño
    if (fallDistance > SAFE_FALL_BLOCKS) {
      const damage = Math.floor((fallDistance - SAFE_FALL_BLOCKS) * 2);
      this.takeDamage(damage);
    }
  }

  takeDamage(amount) {
    if (this.mode !== 'survival' || this.isDead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
    if (this.health <= 0) {
      this.isDead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  respawnAt(x, z) {
    const y = this.world.getSpawnHeight(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this._peakY = null;
    this.isDead = false;
    if (this.mode === 'survival') {
      this.health = this.maxHealth;
      if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
    }
  }

  // Restaura una posición/salud guardadas (usado al continuar una partida)
  restoreState({ x, y, z, yaw, pitch, health } = {}) {
    if (x !== undefined) this.position.set(x, y, z);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    if (health !== undefined && this.mode === 'survival') {
      this.health = health;
      if (this.onHealthChange) this.onHealthChange(this.health, this.maxHealth);
    }
  }

  // ---------------------------------------------------------
  // Raycasting voxel (algoritmo DDA de Amanatides & Woo).
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

    return null;
  }
}
