// ============================================================
// touch-controls.js - Controles para celular y tablet.
//
// Usamos la API de Pointer Events (pointerdown/move/up) en vez
// de Touch Events "puros": Pointer Events unifica mouse, dedo y
// lápiz óptico en un solo modelo de eventos, así que estos
// controles responden igual de bien los pruebes con el dedo en
// un celular o con el mouse en una notebook con pantalla táctil.
//
//   - Joystick virtual (mitad izquierda) para moverse
//   - Arrastre (mitad derecha) para mirar alrededor
//   - Botones para saltar / romper / colocar
//
// No toca la lógica del juego: solo simula las mismas señales
// que ya entiende Player (this.keys y this.look()) y llama a los
// mismos callbacks de romper/colocar que usa el mouse en main.js.
// ============================================================

export function isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

export class TouchControls {
  constructor(player, { onBreak, onPlace } = {}) {
    this.player = player;
    this.onBreak = onBreak;
    this.onPlace = onPlace;

    this.joystickPointerId = null;
    this.lookPointerId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };

    this._buildUI();
    this._setupJoystick();
    this._setupLook();
    this._setupButtons();
  }

  _buildUI() {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = `
      <div id="joystick-zone"><div id="joystick-knob"></div></div>
      <div id="look-zone"></div>
      <div id="touch-action-buttons">
        <button id="touch-break" type="button" aria-label="Romper bloque">⛏️</button>
        <button id="touch-jump" type="button" aria-label="Saltar">⬆</button>
        <button id="touch-place" type="button" aria-label="Colocar bloque">🧱</button>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.joyZone = document.getElementById('joystick-zone');
    this.joyKnob = document.getElementById('joystick-knob');
    this.lookZone = document.getElementById('look-zone');
  }

  // ---------- Joystick de movimiento (izquierda) ----------
  _setupJoystick() {
    const zone = this.joyZone;
    const radius = 45;

    zone.addEventListener('pointerdown', (e) => {
      if (this.joystickPointerId !== null) return; // ya hay un dedo usando el joystick
      this.joystickPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const rect = zone.getBoundingClientRect();
      this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      let dx = e.clientX - this.joystickCenter.x;
      let dy = e.clientY - this.joystickCenter.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) { dx = (dx / dist) * radius; dy = (dy / dist) * radius; }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;

      const nx = dx / radius, ny = dy / radius;
      const threshold = 0.25;
      this.player.keys['KeyW'] = ny < -threshold;
      this.player.keys['KeyS'] = ny > threshold;
      this.player.keys['KeyD'] = nx > threshold;
      this.player.keys['KeyA'] = nx < -threshold;
      e.preventDefault();
    });

    const release = (e) => {
      if (e.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.joyKnob.style.transform = 'translate(0px, 0px)';
      this.player.keys['KeyW'] = false;
      this.player.keys['KeyS'] = false;
      this.player.keys['KeyD'] = false;
      this.player.keys['KeyA'] = false;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  // ---------- Arrastre para mirar alrededor (derecha) ----------
  _setupLook() {
    const zone = this.lookZone;

    zone.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return;
      this.lookPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.player.look(dx, dy, 0.0045);
      e.preventDefault();
    });

    const release = (e) => {
      if (e.pointerId === this.lookPointerId) this.lookPointerId = null;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  // ---------- Botones de acción ----------
  _setupButtons() {
    const jumpBtn = document.getElementById('touch-jump');
    const breakBtn = document.getElementById('touch-break');
    const placeBtn = document.getElementById('touch-place');

    // Saltar: se mantiene "presionado" mientras el dedo/click esté abajo
    jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.player.keys['Space'] = true; });
    jumpBtn.addEventListener('pointerup', (e) => { e.preventDefault(); this.player.keys['Space'] = false; });
    jumpBtn.addEventListener('pointercancel', () => { this.player.keys['Space'] = false; });
    jumpBtn.addEventListener('pointerleave', () => { this.player.keys['Space'] = false; });

    // Romper / colocar: una acción por toque/click
    breakBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onBreak) this.onBreak();
    });
    placeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onPlace) this.onPlace();
    });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }
}
