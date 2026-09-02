// ============================================================
// main.js - Punto de entrada del juego.
//
// IMPORTANTE sobre el orden del código en este archivo:
// Conectamos TODOS los botones de la interfaz (login, registro,
// invitado, logout, modo creativo/supervivencia) ANTES de armar
// el motor 3D (Three.js). Así, si algo falla al crear la escena
// 3D (por ejemplo un navegador viejo sin WebGL), los botones de
// login/registro siguen funcionando en vez de quedar "muertos"
// junto con el resto del script.
// ============================================================
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { BLOCK, BLOCK_DATA } from './blocks.js';
import { TouchControls, isTouchDevice } from './touch-controls.js';
import * as Auth from './auth.js';

const fatalErrorEl = document.getElementById('fatal-error');
function showFatalError(context, err) {
  console.error(`[WebCraft] Error en ${context}:`, err);
  if (!fatalErrorEl) return;
  fatalErrorEl.textContent = `⚠️ Ups, algo falló (${context}): ${err && err.message ? err.message : err}`;
  fatalErrorEl.classList.remove('hidden');
}
window.addEventListener('error', (e) => showFatalError('script', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showFatalError('promesa', e.reason));

const authScreen = document.getElementById('auth-screen');
const authTabLogin = document.getElementById('tab-login');
const authTabRegister = document.getElementById('tab-register');
const authFormTitle = document.getElementById('auth-form-title');
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

let isGuest = false;
let savedGame = null;
let authMode = 'login';

authTabLogin.addEventListener('click', () => setAuthMode('login'));
authTabRegister.addEventListener('click', () => setAuthMode('register'));

function setAuthMode(mode) {
  authMode = mode;
  authTabLogin.classList.toggle('active', mode === 'login');
  authTabRegister.classList.toggle('active', mode === 'register');
  const label = mode === 'login' ? 'Iniciar sesión' : 'Crear perfil';
  authFormTitle.textContent = label;
  authSubmit.textContent = label;
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

creativeBtn.addEventListener('click', () => startGame('creative'));
survivalBtn.addEventListener('click', () => startGame('survival'));

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
      savedGame = null;
    }
    continueHint.classList.toggle('hidden', !savedGame);
  } else {
    welcomeText.textContent = 'Jugando como invitado (tu progreso no se va a guardar).';
    logoutBtn.classList.add('hidden');
    continueHint.classList.add('hidden');
  }
}

(async function autoLoginIfPossible() {
  if (Auth.getToken()) {
    authStatus.classList.remove('hidden');
    authStatus.textContent = 'Recuperando tu sesión...';
    try {
      await goToStartScreen();
    } catch (err) {
      Auth.clearSession();
    } finally {
      authStatus.classList.add('hidden');
    }
  }
})();

let scene, camera, renderer, sun, world, player, inventory, touchControls;
let highlightMesh;
let gameStarted = false;
let gameMode = 'creative';
let engineReady = false;

try {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 40, 130);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.setAttribute('tabindex', '0');
  gameContainer.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(80, 120, 40);
  scene.add(sun);
  scene.add(sun.target);

  const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  highlightMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(highlightGeo),
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  highlightMesh.visible = false;
  scene.add(highlightMesh);

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!player || !player.isLocked || !gameStarted) return;
    if (e.button === 0) breakBlock();
    else if (e.button === 2) placeBlock();
  });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  engineReady = true;
  requestAnimationFrame(animate);
} catch (err) {
  showFatalError('inicializar el motor 3D', err);
}

function startGame(mode) {
  if (!engineReady) {
    showFatalError('iniciar el juego', new Error('El motor 3D no se pudo cargar. Recargá la página.'));
    return;
  }
  try {
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

    if (savedGame && savedGame.mode === mode && !isGuest) {
      player.restoreState(savedGame.player);
      if (mode === 'survival') inventory.restoreCounts(savedGame.inventory);
    } else {
      player.respawnAt(0.5, 0.5);
    }

    if (isTouchDevice()) {
      touchControls = new TouchControls(player, { onBreak: breakBlock, onPlace: placeBlock });
    }

    if (!isTouchDevice()) renderer.domElement.requestPointerLock();

    if (!isGuest && Auth.getToken()) startAutoSave();
  } catch (err) {
    showFatalError('iniciar la partida', err);
  }
}

function breakBlock() {
  if (!gameStarted || !player || player.isDead) return;
  const hit = player.raycastBlock(6);
  if (!hit) return;
  const data = BLOCK_DATA[hit.blockId];
  if (data && data.unbreakable) return;

  world.setBlock(hit.position.x, hit.position.y, hit.position.z, BLOCK.AIR);
  if (gameMode === 'survival') inventory.addBlock(hit.blockId, 1);
}

function placeBlock() {
  if (!gameStarted || !player || player.isDead) return;
  const hit = player.raycastBlock(6);
  if (!hit) return;
  if (gameMode === 'survival' && !inventory.canPlaceSelected()) return;

  const p = hit.previousPosition;
  if (wouldCollideWithPlayer(p)) return;

  world.setBlock(p.x, p.y, p.z, inventory.selectedBlock);
  if (gameMode === 'survival') inventory.consumeSelected();
}

function wouldCollideWithPlayer(blockPos) {
  const px = player.position.x, py = player.position.y, pz = player.position.z;
  const withinX = Math.abs(blockPos.x + 0.5 - px) < 0.7;
  const withinZ = Math.abs(blockPos.z + 0.5 - pz) < 0.7;
  const withinY = blockPos.y < py + 1.8 && blockPos.y + 1 > py;
  return withinX && withinZ && withinY;
}

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

let autoSaveInterval = null;

function startAutoSave() {
  if (autoSaveInterval) clearInterval(autoSaveInterval);
  autoSaveInterval = setInterval(persistGame, 15000);
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
    // reintenta solo en el próximo ciclo
  }
}

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
    const k = player.keys;
    debugEl.textContent =
      `WebCraft | FPS: ${fps}\n` +
      `Pos: ${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)}\n` +
      `Bloque: ${selectedName}\n` +
      `Locked: ${player.isLocked} | OnGround: ${player.onGround}\n` +
      `Teclas detectadas (total): ${player.keydownCount}\n` +
      `W:${!!k['KeyW']} A:${!!k['KeyA']} S:${!!k['KeyS']} D:${!!k['KeyD']} Space:${!!k['Space']}`;
  }

  renderer.render(scene, camera);
}
