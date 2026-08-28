// ============================================================
// main.js - Punto de entrada del juego.
// Flujo completo:
//   1) Pantalla de login/registro (o "jugar como invitado")
//   2) Pantalla de elegir modo (Creativo / Supervivencia)
//   3) Juego: arma la escena de Three.js y corre el game loop
//   4) Autoguardado periódico del progreso (si hay sesión)
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { BLOCK, BLOCK_DATA } from './blocks.js';
import { TouchControls, isTouchDevice } from './touch-controls.js';
import * as Auth from './auth.js';

// ---------- Elementos del DOM ----------
const authScreen = document.getElementById('auth-screen');
const authTabLogin = document.getElementById('tab-login');
const authTabRegister = document.getElementById('tab-register');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authSubmit = document.getElementById('auth-submit');
const authError = document.getElementById('auth-error');
const authStatus = document.getElementById('auth-status');
const playAsGuestBtn = document.getElementById('play-as-guest');

const startScreen = document.getElementById('start-screen');
const welcomeText = document.getElementById('welcome-text');
const continueHint = document.getElementById('continue-hint');
const creativeBtn = document.getElementById('creative-btn');
const survivalBtn = document.getElementById('survival-btn');
const logoutBtn = document.getElementById('logout-btn');

const hud = document.getElementById('hud');
const hotbarEl = document.getElementById('hotbar');
const debugEl = document.getElementById('debug-info');
const healthBarEl = document.getElementById('health-bar');
const deathMessageEl = document.getElementById('death-message');
const saveIndicatorEl = document.getElementById('save-indicator');
const gameContainer = document.getElementById('game-container');

// ---------- Estado de sesión / partida guardada ----------
let isGuest = false;
let savedGame = null; // lo que devuelve el backend, si había una partida previa
let authMode = 'login'; // 'login' | 'register'

// ============================================================
// PASO 1: Login / Registro
// ============================================================

authTabLogin.addEventListener('click', () => setAuthMode('login'));
authTabRegister.addEventListener('click', () => setAuthMode('register'));

function setAuthMode(mode) {
  authMode = mode;
  authTabLogin.classList.toggle('active', mode === 'login');
  authTabRegister.classList.toggle('active', mode === 'register');
  authSubmit.textContent = mode === 'login' ? 'Iniciar sesión' : 'Crear usuario';
  authPassword.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  hideAuthError();
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}
function hideAuthError() { authError.classList.add('hidden'); }

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthError();
  const username = authUsername.value.trim();
  const password = authPassword.value;

  authSubmit.disabled = true;
  authStatus.classList.remove('hidden');
  authStatus.textContent = 'Conectando...';

  try {
    if (authMode === 'login') {
      await Auth.login(username, password);
    } else {
      await Auth.register(username, password);
    }
    await goToStartScreen();
  } catch (err) {
    showAuthError(err.message || 'No se pudo conectar. Probá de nuevo.');
  } finally {
    authSubmit.disabled = false;
    authStatus.classList.add('hidden');
  }
});

playAsGuestBtn.addEventListener('click', () => {
  isGuest = true;
  Auth.clearSession();
  goToStartScreen();
});

logoutBtn.addEventListener('click', () => {
  Auth.clearSession();
  isGuest = false;
  savedGame = null;
  startScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authUsername.value = '';
  authPassword.value = '';
});

// Si ya había una sesión guardada en este navegador, entramos directo
(async function autoLoginIfPossible() {
  if (Auth.getToken()) {
    authStatus.classList.remove('hidden');
    authStatus.textContent = 'Recuperando tu sesión...';
    try {
      await goToStartScreen();
    } catch (err) {
      // El token puede haber vencido o el server puede estar despertando (Render "duerme" servicios gratis inactivos)
      Auth.clearSession();
      authStatus.classList.add('hidden');
    }
  }
})();

async function goToStartScreen() {
  authScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');

  const username = Auth.getUsername();
  if (username && !isGuest) {
    welcomeText.textContent = `¡Hola, ${username}! Elegí cómo querés jugar.`;
    logoutBtn.classList.remove('hidden');
    try {
      savedGame = await Auth.loadGame();
    } catch {
      savedGame = null; // si el backend no respondió, seguimos igual sin bloquear al usuario
    }
    if (savedGame) {
      continueHint.classList.remove('hidden');
      // Preseleccionamos visualmente el modo guardado resaltando el botón correspondiente
    } else {
      continueHint.classList.add('hidden');
    }
  } else {
    welcomeText.textContent = 'Jugando como invitado (tu progreso no se va a guardar).';
    logoutBtn.classList.add('hidden');
    continueHint.classList.add('hidden');
  }
}

// ============================================================
// PASO 2 y 3: Elegir modo -> Armar el juego
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.setAttribute('tabindex', '0'); // asegura que el canvas pueda recibir foco/teclado
gameContainer.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(80, 120, 40);
scene.add(sun);
scene.add(sun.target);

let world = null;
let player = null;
let inventory = null;
let touchControls = null;
let gameStarted = false;
let gameMode = 'creative';

const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const highlightMesh = new THREE.LineSegments(
  new THREE.EdgesGeometry(highlightGeo),
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
highlightMesh.visible = false;
scene.add(highlightMesh);

creativeBtn.addEventListener('click', () => startGame('creative'));
survivalBtn.addEventListener('click', () => startGame('survival'));

function startGame(mode) {
  gameMode = mode;
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  gameStarted = true;

  world = new World(scene, 20260827);
  player = new Player(camera, renderer.domElement, world, mode);
  inventory = new Inventory(hotbarEl, mode);

  if (mode === 'survival') {
    healthBarEl.classList.remove('hidden');
    player.onHealthChange = renderHealthBar;
    player.onDeath = handleDeath;
    renderHealthBar(player.health, player.maxHealth);
  } else {
    healthBarEl.classList.add('hidden');
  }

  world.update(0, 0);

  // Si había una partida guardada Y coincide el modo, retomamos justo donde quedó
  if (savedGame && savedGame.mode === mode && !isGuest) {
    player.restoreState(savedGame.player);
    if (mode === 'survival') inventory.restoreCounts(savedGame.inventory);
  } else {
    player.respawnAt(0.5, 0.5);
  }

  // Controles táctiles (solo se activan solos si el dispositivo es táctil)
  if (isTouchDevice()) {
    touchControls = new TouchControls(player, { onBreak: breakBlock, onPlace: placeBlock });
  }

  // Intento de Pointer Lock inicial en PC (en táctil no hace nada, y si el navegador
  // lo rechaza por no venir de un gesto directo, el click en el canvas lo vuelve a pedir)
  if (!isTouchDevice()) renderer.domElement.requestPointerLock();

  if (!isGuest && Auth.getToken()) startAutoSave();
}

// ---------- Romper / colocar bloques ----------
function breakBlock() {
  if (!gameStarted || player.isDead) return;
  const hit = player.raycastBlock(6);
  if (!hit) return;
  const data = BLOCK_DATA[hit.blockId];
  if (data && data.unbreakable) return;

  world.setBlock(hit.position.x, hit.position.y, hit.position.z, BLOCK.AIR);
  if (gameMode === 'survival') inventory.addBlock(hit.blockId, 1);
}

function placeBlock() {
  if (!gameStarted || player.isDead) return;
  const hit = player.raycastBlock(6);
  if (!hit) return;
  if (gameMode === 'survival' && !inventory.canPlaceSelected()) return;

  const p = hit.previousPosition;
  if (wouldCollideWithPlayer(p)) return;

  world.setBlock(p.x, p.y, p.z, inventory.selectedBlock);
  if (gameMode === 'survival') inventory.consumeSelected();
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!player || !player.isLocked || !gameStarted) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function wouldCollideWithPlayer(blockPos) {
  const px = player.position.x, py = player.position.y, pz = player.position.z;
  const withinX = Math.abs(blockPos.x + 0.5 - px) < 0.7;
  const withinZ = Math.abs(blockPos.z + 0.5 - pz) < 0.7;
  const withinY = blockPos.y < py + 1.8 && blockPos.y + 1 > py;
  return withinX && withinZ && withinY;
}

// ---------- Vida (supervivencia) ----------
function renderHealthBar(health, maxHealth) {
  healthBarEl.innerHTML = '';
  const totalHearts = maxHealth / 2;
  const fullHearts = Math.ceil(health / 2);
  for (let i = 0; i < totalHearts; i++) {
    const heart = document.createElement('span');
    heart.className = 'heart' + (i < fullHearts ? '' : ' empty');
    heart.textContent = '❤';
    healthBarEl.appendChild(heart);
  }
}

function handleDeath() {
  deathMessageEl.classList.remove('hidden');
  setTimeout(() => {
    world.update(0, 0);
    player.respawnAt(0.5, 0.5);
    deathMessageEl.classList.add('hidden');
  }, 1500);
}

// ============================================================
// Autoguardado (solo si hay sesión, no como invitado)
// ============================================================
let autoSaveInterval = null;

function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(persistGame, 15000); // cada 15s
  window.addEventListener('beforeunload', persistGame);
}

async function persistGame() {
  if (!gameStarted || isGuest || !Auth.getToken() || !player) return;
  const state = {
    mode: gameMode,
    player: {
      x: player.position.x, y: player.position.y, z: player.position.z,
      yaw: player.yaw, pitch: player.pitch,
      health: player.health,
    },
    inventory: gameMode === 'survival' ? inventory.getCountsSnapshot() : null,
    savedAt: Date.now(),
  };
  try {
    await Auth.saveGame(state);
    saveIndicatorEl.classList.remove('hidden');
    saveIndicatorEl.classList.add('show');
    setTimeout(() => saveIndicatorEl.classList.remove('show'), 1200);
  } catch {
    // Si falla el guardado (ej. sin internet momentáneo) simplemente reintentamos en el próximo ciclo
  }
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

  if (gameStarted && player && world) {
    player.update(dt);
    world.update(player.position.x, player.position.z);

    sun.position.set(player.position.x + 80, 120, player.position.z + 40);
    sun.target.position.set(player.position.x, 0, player.position.z);

    const hit = player.raycastBlock(6);
    if (hit) {
      highlightMesh.visible = true;
      highlightMesh.position.set(hit.position.x + 0.5, hit.position.y + 0.5, hit.position.z + 0.5);
    } else {
      highlightMesh.visible = false;
    }

    fpsAccum += 1 / Math.max(dt, 0.0001); frameCount++;
    if (frameCount >= 20) { fps = Math.round(fpsAccum / frameCount); fpsAccum = 0; frameCount = 0; }
    const selectedName = BLOCK_DATA[inventory.selectedBlock]?.name || '-';
    debugEl.textContent =
      `WebCraft | FPS: ${fps}\n` +
      `Pos: ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
      `Bloque: ${selectedName}`;
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
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
