// ============================================================
// inventory.js - Hotbar (barra de bloques seleccionables).
//  - Modo Creativo: todos los bloques disponibles, cantidad infinita.
//  - Modo Supervivencia: arrancás sin nada; romper bloques los
//    suma al inventario, colocar los resta. No podés colocar si
//    no tenés cantidad de ese bloque.
// ============================================================
import { HOTBAR_BLOCKS, BLOCK_DATA } from './blocks.js';

export class Inventory {
  constructor(containerEl, mode = 'creative') {
    this.mode = mode;
    this.blocks = HOTBAR_BLOCKS;
    this.counts = {};
    this.blocks.forEach((id) => { this.counts[id] = 0; });

    this.selectedIndex = 0;
    this.containerEl = containerEl;
    this._renderSlots();
    this._setupInput();
  }

  get selectedBlock() {
    return this.blocks[this.selectedIndex];
  }

  // ¿Se puede colocar el bloque seleccionado ahora mismo?
  canPlaceSelected() {
    if (this.mode === 'creative') return true;
    return (this.counts[this.selectedBlock] || 0) > 0;
  }

  consumeSelected() {
    if (this.mode === 'creative') return;
    this.counts[this.selectedBlock] = Math.max(0, (this.counts[this.selectedBlock] || 0) - 1);
    this._updateCount(this.selectedIndex);
  }

  // Sumar un bloque al inventario (ej: al romperlo en supervivencia)
  addBlock(blockId, amount = 1) {
    if (this.mode === 'creative') return; // en creativo no hace falta contar nada
    if (!this.blocks.includes(blockId)) return; // solo contamos bloques de la hotbar
    this.counts[blockId] = (this.counts[blockId] || 0) + amount;
    this._updateCount(this.blocks.indexOf(blockId));
  }

  // Para guardar/restaurar partida
  getCountsSnapshot() {
    return { ...this.counts };
  }

  restoreCounts(counts) {
    if (!counts) return;
    this.blocks.forEach((id) => {
      this.counts[id] = counts[id] || 0;
      this._updateCount(this.blocks.indexOf(id));
    });
  }

  _renderSlots() {
    this.containerEl.innerHTML = '';
    this.slotEls = this.blocks.map((blockId, i) => {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';

      const label = document.createElement('div');
      label.className = 'key-label';
      label.textContent = (i + 1).toString();
      slot.appendChild(label);

      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.background = this._colorFor(blockId);
      slot.appendChild(swatch);

      if (this.mode === 'survival') {
        const count = document.createElement('div');
        count.className = 'count-label';
        count.textContent = this.counts[blockId] || 0;
        slot.appendChild(count);
      }

      slot.title = BLOCK_DATA[blockId].name;
      slot.addEventListener('click', () => this.select(i));
      // También funciona con touch (tap) sin retraso extra
      slot.addEventListener('touchstart', (e) => { e.preventDefault(); this.select(i); }, { passive: false });

      this.containerEl.appendChild(slot);
      return slot;
    });
    this._updateSelectedVisual();
  }

  _updateCount(index) {
    const slot = this.slotEls[index];
    if (!slot) return;
    const countEl = slot.querySelector('.count-label');
    if (countEl) countEl.textContent = this.counts[this.blocks[index]] || 0;
  }

  _colorFor(blockId) {
    const colors = {
      1: '#5fa83c', 2: '#8a5a34', 3: '#828282', 4: '#dfd69e',
      5: '#3764dc', 6: '#5c4228', 7: '#2e6e28', 9: '#f0f0f5',
    };
    return colors[blockId] || '#999';
  }

  select(index) {
    this.selectedIndex = ((index % this.blocks.length) + this.blocks.length) % this.blocks.length;
    this._updateSelectedVisual();
  }

  _updateSelectedVisual() {
    this.slotEls.forEach((el, i) => el.classList.toggle('selected', i === this.selectedIndex));
  }

  _setupInput() {
    window.addEventListener('keydown', (e) => {
      const n = parseInt(e.code.replace('Digit', ''), 10);
      if (!isNaN(n) && n >= 1 && n <= this.blocks.length) this.select(n - 1);
    });

    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement) {
        this.select(this.selectedIndex + (e.deltaY > 0 ? 1 : -1));
      }
    });
  }
}
