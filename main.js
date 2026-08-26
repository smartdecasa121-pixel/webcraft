// ============================================================
// main.js - Punto de entrada del juego.
// Arma la escena de Three.js (cámara, luces, cielo, niebla),
// crea el mundo, el jugador y el inventario, y corre el bucle
// principal (game loop): actualizar física -> generar chunks
// cercanos -> manejar clicks para romper/poner bloques -> dibujar.
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { BLOCK, BLOCK_DATA } from './blocks.js';

// ---------- Elementos del DOM ----------
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const hud = document.getElementById('hud');
const hotbarEl = document.getElementById('hotbar');
const debugEl = document.getElementById('debug-info');
const gameContainer = document.getElementById('game-container');

// ---------- Escena, cámara y renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 130);

const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 500
);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
gameContainer.appendChild(renderer.domElement);

// ---------- Luces (luz ambiente + sol direccional simple) ----------
const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(80, 120, 40);
scene.add(sun);
scene.add(sun.target);

// ---------- Mundo, jugador e inventario ----------
const world = new World(scene, 20260827); // seed fijo -> mismo mundo siempre
const player = new Player(camera, renderer.domElement, world);
const inventory = new Inventory(hotbarEl);

// Marcador (wireframe) que resalta el bloque al que estamos apuntando
const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
const highlightMesh = new THREE.LineSegments(
  highlightEdges, new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
);
highlightMesh.visible = false;
scene.add(highlightMesh);

// ---------- Iniciar el juego al hacer click en "Jugar" ----------
let gameStarted = false;
startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  renderer.domElement.requestPointerLock();
  gameStarted = true;

  // Generamos el chunk inicial antes de spawnear para no caer al vacío
  world.update(0, 0);
  player.respawnAt(0.5, 0.5);
});

// ---------- Romper / colocar bloques con click ----------
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!player.isLocked || !gameStarted) return;
  const hit = player.raycastBlock(6);
  if (!hit) return;

  if (e.button === 0) {
    // Click izquierdo: romper (si no es irrompible como el bedrock)
    const data = worldBlockData(hit.blockId);
    if (data && data.unbreakable) return;
    world.setBlock(hit.position.x, hit.position.y, hit.position.z, BLOCK.AIR);
  } else if (e.button === 2) {
    // Click derecho: colocar el bloque seleccionado, si el hueco no pisa al jugador
    const p = hit.previousPosition;
    if (!wouldCollideWithPlayer(p)) {
      world.setBlock(p.x, p.y, p.z, inventory.selectedBlock);
    }
  }
});
// Evitamos que aparezca el menú contextual del navegador con el click derecho
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function worldBlockData(id) { return BLOCK_DATA[id]; }

function wouldCollideWithPlayer(blockPos) {
  const px = player.position.x, py = player.position.y, pz = player.position.z;
  const withinX = Math.abs(blockPos.x + 0.5 - px) < 0.7;
  const withinZ = Math.abs(blockPos.z + 0.5 - pz) < 0.7;
  const withinY = blockPos.y < py + 1.8 && blockPos.y + 1 > py;
  return withinX && withinZ && withinY;
}

// ---------- Responsive ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Bucle principal ----------
let lastTime = performance.now();
let frameCount = 0, fpsAccum = 0, fps = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (gameStarted) {
    player.update(dt);
    world.update(player.position.x, player.position.z);

    // El sol "sigue" al jugador para que siempre haya sombra/luz cerca
    sun.position.set(player.position.x + 80, 120, player.position.z + 40);
    sun.target.position.set(player.position.x, 0, player.position.z);

    // Actualizamos el marcador del bloque apuntado
    const hit = player.raycastBlock(6);
    if (hit) {
      highlightMesh.visible = true;
      highlightMesh.position.set(hit.position.x + 0.5, hit.position.y + 0.5, hit.position.z + 0.5);
    } else {
      highlightMesh.visible = false;
    }

    // Debug info (FPS + posición), útil también para verificar que el juego "vive"
    fpsAccum += 1 / dt; frameCount++;
    if (frameCount >= 20) { fps = Math.round(fpsAccum / frameCount); fpsAccum = 0; frameCount = 0; }
    const selectedName = BLOCK_DATA[inventory.selectedBlock]?.name || '-';
    debugEl.textContent =
      `WebCraft | FPS: ${fps}\n` +
      `Pos: ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
      `Bloque seleccionado: ${selectedName}`;
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
