// ============================================================
// inventory.js - Hotbar simple (barra de bloques seleccionables,
// como en Minecraft). No maneja "cantidades" todavía: es un
// inventario creativo donde todos los bloques están disponibles
// siempre (fácil de extender a un inventario con límites).
// ============================================================
import { HOTBAR_BLOCKS, BLOCK_DATA } from './blocks.js';

export class Inventory {
  constructor(containerEl) {
    this.blocks = HOTBAR_BLOCKS;
    this.selectedIndex = 0;
    this.containerEl = containerEl;
    this._renderSlots();
    this._setupInput();
  }

  get selectedBlock() {
    return this.blocks[this.selectedIndex];
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

      slot.title = BLOCK_DATA[blockId].name;
      slot.addEventListener('click', () => this.select(i));

      this.containerEl.appendChild(slot);
      return slot;
    });
    this._updateSelectedVisual();
  }

  // Un color representativo aproximado por bloque, solo para el ícono de la UI
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
