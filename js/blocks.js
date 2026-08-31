// ============================================================
// blocks.js - Catálogo de bloques del juego.
// Cada bloque tiene un id numérico (así los guardamos como
// bytes en el array del chunk), un nombre, si es sólido
// (colisiona / bloquea la vista) y qué textura usa por cara.
//
// >>> PARA AGREGAR UN BLOQUE NUEVO (mods/plugins) <
// Solo hay que sumar una entrada acá con un id nuevo, indicar
// sus texturas (deben existir en textures.js) y listo: el
// motor de mundo y de render ya lo van a dibujar solo.
// ============================================================

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BEDROCK: 8,
  SNOW: 9,
};

// "top", "side", "bottom" apuntan a claves del atlas (textures.js).
// Si un bloque usa la misma textura en todas las caras, alcanza con "all".
export const BLOCK_DATA = {
  [BLOCK.GRASS]:   { name: 'Pasto',   solid: true,  transparent: false, faces: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
  [BLOCK.DIRT]:    { name: 'Tierra',  solid: true,  transparent: false, faces: { all: 'dirt' } },
  [BLOCK.STONE]:   { name: 'Piedra',  solid: true,  transparent: false, faces: { all: 'stone' } },
  [BLOCK.SAND]:    { name: 'Arena',   solid: true,  transparent: false, faces: { all: 'sand' } },
  [BLOCK.WATER]:   { name: 'Agua',    solid: false, transparent: true,  faces: { all: 'water' } },
  [BLOCK.WOOD]:    { name: 'Madera',  solid: true,  transparent: false, faces: { top: 'wood_top', side: 'wood_side', bottom: 'wood_top' } },
  [BLOCK.LEAVES]:  { name: 'Hojas',   solid: true,  transparent: true,  faces: { all: 'leaves' } },
  [BLOCK.BEDROCK]: { name: 'Roca base', solid: true, transparent: false, faces: { all: 'bedrock' }, unbreakable: true },
  [BLOCK.SNOW]:    { name: 'Nieve',   solid: true,  transparent: false, faces: { top: 'snow', side: 'snow', bottom: 'dirt' } },
};

export function getBlockFaceTexture(blockId, face) {
  const data = BLOCK_DATA[blockId];
  if (!data) return null;
  if (data.faces.all) return data.faces.all;
  return data.faces[face] || data.faces.side;
}

export function isSolid(blockId) {
  return blockId !== BLOCK.AIR && BLOCK_DATA[blockId] && BLOCK_DATA[blockId].solid;
}

export function isTransparent(blockId) {
  if (blockId === BLOCK.AIR) return true;
  return !!(BLOCK_DATA[blockId] && BLOCK_DATA[blockId].transparent);
}

// Bloques disponibles en la hotbar inicial del jugador (en orden)
export const HOTBAR_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND,
  BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SNOW, BLOCK.WATER,
];
