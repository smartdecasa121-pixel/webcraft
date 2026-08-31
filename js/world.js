// ============================================================
// world.js - El corazón del juego: genera el terreno en
// "chunks" (trozos de 16x16 de ancho) y construye la geometría
// 3D de cada uno, dibujando solo las caras de bloque que están
// pegadas a aire (esto se llama "face culling" y es clave para
// que un mundo de voxels rinda bien en el navegador).
// ============================================================
import * as THREE from 'three';
import { Noise } from './noise.js';
import { BLOCK, isSolid, isTransparent, getBlockFaceTexture } from './blocks.js';
import { buildTextureAtlas } from './textures.js';

export const CHUNK_SIZE = 16;    // ancho y profundidad de cada chunk
export const CHUNK_HEIGHT = 48;  // altura máxima del mundo
export const SEA_LEVEL = 18;
const RENDER_DISTANCE = 3;       // en chunks, alrededor del jugador

// Normales y vértices de las 6 caras de un cubo unitario.
// Cada cara: [ [x,y,z, u,v] x4 vértices ], normal, y a qué eje/signo corresponde
const FACES = [
  { dir: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], face: 'side' }, // +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], face: 'side' }, // -X
  { dir: [0, 1, 0],  corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], face: 'top'  }, // +Y
  { dir: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], face: 'bottom' }, // -Y
  { dir: [0, 0, 1],  corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], face: 'side' }, // +Z
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], face: 'side' }, // -Z
];

function chunkKey(cx, cz) { return `${cx},${cz}`; }

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    // Un byte por bloque: suficiente para nuestros ~10 tipos de bloque
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    this.mesh = null;
    this.waterMesh = null;
    this.dirty = true; // hay que (re)construir la geometría
  }

  index(x, y, z) {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  getLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) return undefined;
    return this.blocks[this.index(x, y, z)];
  }

  setLocal(x, y, z, id) {
    this.blocks[this.index(x, y, z)] = id;
  }
}

export class World {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.noise = new Noise(seed);
    this.caveNoise = new Noise(seed + 999);
    this.chunks = new Map();

    const { texture, uvOf } = buildTextureAtlas();
    this.atlasTexture = texture;
    this.uvOf = uvOf;

    this.material = new THREE.MeshLambertMaterial({ map: texture, vertexColors: false });
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: texture, transparent: true, opacity: 0.65, depthWrite: false,
    });
  }

  // ---------- Generación de terreno ----------

  heightAt(worldX, worldZ) {
    const n = this.noise.fractal2D(worldX * 0.015, worldZ * 0.015, 4, 0.5, 1);
    // n va aprox de -1 a 1 -> lo mapeamos a una altura de terreno
    const height = Math.floor(SEA_LEVEL + n * 12 + 6);
    return Math.max(2, Math.min(CHUNK_HEIGHT - 6, height));
  }

  isCave(worldX, worldY, worldZ) {
    // Ruido 3D: si supera un umbral, ahí "cavamos" una cueva
    const n = this.caveNoise.noise3D(worldX * 0.08, worldY * 0.08, worldZ * 0.08);
    return n > 0.6;
  }

  generateChunk(cx, cz) {
    const chunk = new Chunk(cx, cz);
    const originX = cx * CHUNK_SIZE;
    const originZ = cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = originX + x;
        const wz = originZ + z;
        const h = this.heightAt(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = BLOCK.AIR;

          if (y === 0) {
            id = BLOCK.BEDROCK;
          } else if (y < h - 4) {
            id = BLOCK.STONE;
          } else if (y < h - 1) {
            id = BLOCK.DIRT;
          } else if (y === h - 1) {
            id = h <= SEA_LEVEL + 1 ? BLOCK.SAND : (h > SEA_LEVEL + 16 ? BLOCK.SNOW : BLOCK.GRASS);
          } else if (y < SEA_LEVEL && y >= h) {
            id = BLOCK.WATER; // rellenamos con agua hasta el nivel del mar
          }

          // Tallamos cuevas (solo bajo tierra, no cerca de la superficie ni del bedrock)
          if (id === BLOCK.STONE && y > 2 && y < h - 5 && this.isCave(wx, y, wz)) {
            id = BLOCK.AIR;
          }

          chunk.setLocal(x, y, z, id);
        }

        // Árboles: chance baja sobre pasto, lejos del borde del chunk (para simplificar)
        if (x > 1 && x < CHUNK_SIZE - 2 && z > 1 && z < CHUNK_SIZE - 2) {
          const topId = chunk.getLocal(x, h - 1, z);
          if (topId === BLOCK.GRASS) {
            const r = this._pseudoRandom(wx, wz);
            if (r > 0.965) this._placeTree(chunk, x, h, z);
          }
        }
      }
    }

    this.chunks.set(chunkKey(cx, cz), chunk);
    return chunk;
  }

  // Random determinístico según coordenadas (para que los árboles no cambien entre frames)
  _pseudoRandom(x, z) {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  _placeTree(chunk, x, baseY, z) {
    const trunkHeight = 4 + Math.floor(this._pseudoRandom(x * 3.1, z * 7.7) * 2);
    for (let i = 0; i < trunkHeight; i++) {
      if (baseY + i < CHUNK_HEIGHT) chunk.setLocal(x, baseY + i, z, BLOCK.WOOD);
    }
    // copa de hojas simple (esfera achatada)
    const top = baseY + trunkHeight;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -2; dy <= 1; dy++) {
          const lx = x + dx, lz = z + dz, ly = top + dy;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
          if (ly < 0 || ly >= CHUNK_HEIGHT) continue;
          const dist = Math.sqrt(dx * dx + dy * dy * 1.3 + dz * dz);
          if (dist <= 2.2 && chunk.getLocal(lx, ly, lz) === BLOCK.AIR) {
            chunk.setLocal(lx, ly, lz, BLOCK.LEAVES);
          }
        }
      }
    }
  }

  // ---------- Acceso a bloques en coordenadas de mundo ----------

  worldToChunkCoords(x, z) {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  getChunk(cx, cz, createIfMissing = false) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && createIfMissing) chunk = this.generateChunk(cx, cz);
    return chunk;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const [cx, cz] = this.worldToChunkCoords(x, z);
    const chunk = this.getChunk(cx, cz, false);
    if (!chunk) return BLOCK.AIR; // chunk no generado todavía => lo tratamos como aire (no bloquea)
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.getLocal(lx, y, lz) ?? BLOCK.AIR;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const [cx, cz] = this.worldToChunkCoords(x, z);
    const chunk = this.getChunk(cx, cz, true);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.setLocal(lx, y, lz, id);
    chunk.dirty = true;

    // Si el bloque modificado está en el borde del chunk, el chunk vecino
    // también necesita re-dibujarse (para no dejar caras "fantasma")
    if (lx === 0) this._markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this._markDirty(cx + 1, cz);
    if (lz === 0) this._markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this._markDirty(cx, cz + 1);
  }

  _markDirty(cx, cz) {
    const chunk = this.getChunk(cx, cz, false);
    if (chunk) chunk.dirty = true;
  }

  // ---------- Construcción de geometría (meshing) ----------

  buildChunkMesh(chunk) {
    const solidGeo = { pos: [], norm: [], uv: [], idx: [] };
    const waterGeo = { pos: [], norm: [], uv: [], idx: [] };
    const originX = chunk.cx * CHUNK_SIZE;
    const originZ = chunk.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const id = chunk.getLocal(x, y, z);
          if (id === BLOCK.AIR) continue;

          const wx = originX + x, wy = y, wz = originZ + z;
          const target = id === BLOCK.WATER ? waterGeo : solidGeo;

          for (const f of FACES) {
            const nx = wx + f.dir[0], ny = wy + f.dir[1], nz = wz + f.dir[2];
            const neighbor = this.getBlock(nx, ny, nz);

            // Dibujamos la cara solo si el vecino no la tapa
            const neighborBlocksFace = id === BLOCK.WATER
              ? (neighbor === BLOCK.WATER) // el agua no dibuja caras contra sí misma
              : (isSolid(neighbor) && !(isTransparent(neighbor) && neighbor !== id));
            if (neighborBlocksFace) continue;

            const texKey = getBlockFaceTexture(id, f.face);
            const [u0, v0, u1, v1] = this.uvOf(texKey);
            const uvs = [[u0, v1], [u0, v0], [u1, v0], [u1, v1]];

            const startIndex = target.pos.length / 3;
            for (let i = 0; i < 4; i++) {
              const c = f.corners[i];
              target.pos.push(x + c[0], y + c[1], z + c[2]);
              target.norm.push(f.dir[0], f.dir[1], f.dir[2]);
              target.uv.push(uvs[i][0], uvs[i][1]);
            }
            target.idx.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
          }
        }
      }
    }

    this._applyGeometry(chunk, solidGeo, waterGeo, originX, originZ);
  }

  _applyGeometry(chunk, solidGeo, waterGeo, originX, originZ) {
    // Removemos meshes viejos de la escena antes de reemplazarlos
    if (chunk.mesh) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); }
    if (chunk.waterMesh) { this.scene.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); }

    if (solidGeo.pos.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(solidGeo.pos, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(solidGeo.norm, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(solidGeo.uv, 2));
      geometry.setIndex(solidGeo.idx);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.position.set(originX, 0, originZ);
      mesh.userData.isTerrain = true;
      this.scene.add(mesh);
      chunk.mesh = mesh;
    } else {
      chunk.mesh = null;
    }

    if (waterGeo.pos.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(waterGeo.pos, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterGeo.norm, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterGeo.uv, 2));
      geometry.setIndex(waterGeo.idx);
      const mesh = new THREE.Mesh(geometry, this.waterMaterial);
      mesh.position.set(originX, 0, originZ);
      this.scene.add(mesh);
      chunk.waterMesh = mesh;
    } else {
      chunk.waterMesh = null;
    }

    chunk.dirty = false;
  }

  // ---------- Streaming de chunks alrededor del jugador ----------

  update(playerX, playerZ) {
    const [pcx, pcz] = this.worldToChunkCoords(playerX, playerZ);

    // Generar/reconstruir chunks cercanos
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = pcx + dx, cz = pcz + dz;
        let chunk = this.getChunk(cx, cz, true);
        if (chunk.dirty) this.buildChunkMesh(chunk);
      }
    }

    // Descargar chunks lejanos para no consumir memoria/GPU de más
    const maxDist = RENDER_DISTANCE + 2;
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > maxDist || Math.abs(chunk.cz - pcz) > maxDist) {
        if (chunk.mesh) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); }
        if (chunk.waterMesh) { this.scene.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); }
        this.chunks.delete(key);
      }
    }
  }

  // Altura del terreno más alto ocupado en (x,z), útil para spawnear al jugador arriba del piso.
  // Buscamos el primer hueco con al menos 2 bloques de aire libres (pies + cabeza) sobre
  // suelo sólido, escaneando de ABAJO hacia arriba. Esto evita que el jugador aparezca
  // atascado dentro de hojas u otros obstáculos que "isSolid" también cuenta como sólidos.
  getSpawnHeight(x, z) {
    for (let y = 1; y < CHUNK_HEIGHT - 2; y++) {
      const groundBelowIsSolid = isSolid(this.getBlock(x, y - 1, z));
      const feetAreClear = !isSolid(this.getBlock(x, y, z));
      const headIsClear = !isSolid(this.getBlock(x, y + 1, z));
      if (groundBelowIsSolid && feetAreClear && headIsClear) return y;
    }
    return SEA_LEVEL + 3; // respaldo por si no se encontró un hueco válido
  }

  getAllTerrainMeshes() {
    const meshes = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.mesh) meshes.push(chunk.mesh);
    }
    return meshes;
  }
}
