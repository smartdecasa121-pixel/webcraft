// ============================================================
// textures.js - Crea, a mano y en tiempo de ejecución, un
// "atlas" de texturas (una imagen grande con varias texturas
// chiquitas adentro) usando <canvas>. Así no necesitamos subir
// archivos de imagen al repositorio: todo se genera por código.
// ============================================================
import * as THREE from 'three';

const TILE = 16;     // cada textura individual mide 16x16 px (estilo Minecraft)
const COLS = 4;       // columnas del atlas
const ROWS = 3;       // filas del atlas

// Índice (col, row) de cada textura dentro del atlas.
// Cada bloque puede usar una textura distinta por cara (arriba/costado/abajo).
export const TILE_INDEX = {
  grass_top:  [0, 0],
  grass_side: [1, 0],
  dirt:       [2, 0],
  stone:      [3, 0],
  sand:       [0, 1],
  water:      [1, 1],
  wood_side:  [2, 1],
  wood_top:   [3, 1],
  leaves:     [0, 2],
  bedrock:    [1, 2],
  snow:       [2, 2],
};

function rand(min, max) { return Math.random() * (max - min) + min; }

// Dibuja ruido tipo "pixel noise" para dar textura granulada a un tile
function paintNoise(ctx, x, y, baseColor, variance, pixelSize = 2) {
  const [r, g, b] = baseColor;
  for (let px = 0; px < TILE; px += pixelSize) {
    for (let py = 0; py < TILE; py += pixelSize) {
      const v = rand(-variance, variance);
      ctx.fillStyle = `rgb(${clamp(r + v)}, ${clamp(g + v)}, ${clamp(b + v)})`;
      ctx.fillRect(x + px, y + py, pixelSize, pixelSize);
    }
  }
}
function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function cellOrigin(tileKey) {
  const [c, r] = TILE_INDEX[tileKey];
  return [c * TILE, r * TILE];
}

export function buildTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const paint = (key, color, variance, extra) => {
    const [x, y] = cellOrigin(key);
    paintNoise(ctx, x, y, color, variance);
    if (extra) extra(ctx, x, y);
  };

  // Pasto (parte de arriba): verde con textura de hierba
  paint('grass_top', [86, 168, 60], 22);

  // Pasto (costado): tierra abajo + una franja verde de pasto arriba
  {
    const [x, y] = cellOrigin('grass_side');
    paintNoise(ctx, x, y, [134, 96, 67], 14);           // tierra en todo el tile
    for (let px = 0; px < TILE; px++) {                  // franja de pasto arriba
      ctx.fillStyle = `rgb(${clamp(86 + rand(-20, 20))}, ${clamp(150 + rand(-20, 20))}, ${clamp(60 + rand(-10, 10))})`;
      ctx.fillRect(x + px, y, 1, 4);
    }
  }

  paint('dirt',       [134, 96, 67], 18);
  paint('stone',       [128, 128, 128], 16);
  paint('sand',        [223, 214, 158], 12);
  paint('water',       [55, 100, 220], 10);
  paint('wood_side',   [92, 66, 40], 14, (ctx, x, y) => {
    // vetas verticales del tronco
    for (let px = 0; px < TILE; px += 3) {
      ctx.fillStyle = `rgba(0,0,0,0.15)`;
      ctx.fillRect(x + px, y, 1, TILE);
    }
  });
  paint('wood_top',    [175, 138, 90], 10, (ctx, x, y) => {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(x + TILE/2, y + TILE/2, TILE/2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  });
  paint('leaves',      [46, 110, 40], 26);
  paint('bedrock',     [40, 40, 40], 20);
  paint('snow',        [240, 240, 245], 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; // look "pixelado" clásico de Minecraft
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  // Devolvemos también una función que da las coordenadas UV [u0,v0,u1,v1] de un tile
  const uvOf = (key) => {
    const [c, r] = TILE_INDEX[key];
    const u0 = c / COLS, v0 = 1 - (r + 1) / ROWS;
    const u1 = (c + 1) / COLS, v1 = 1 - r / ROWS;
    return [u0, v0, u1, v1];
  };

  return { texture, uvOf };
}
