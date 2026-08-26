# WebCraft 🧱

Un clon de **Minecraft** que corre 100% en el navegador, hecho con **HTML + CSS + JavaScript (ES modules) + Three.js**. No hay backend, no hay build step, no hay que instalar nada: se abre la URL y se juega.

## ▶️ Jugar en local

Como el juego usa ES modules (`import`/`export`), **no funciona abriendo `index.html` con doble click** (los navegadores bloquean `import` en `file://`). Hay que servirlo con un mini servidor local. Cualquiera de estas opciones sirve:

```bash
# Opción 1: con Python (ya viene instalado en la mayoría de los sistemas)
python3 -m http.server 8000

# Opción 2: con Node
npx serve .
```

Después abrí `http://localhost:8000` en el navegador.

## 🎮 Controles

| Acción | Tecla |
|---|---|
| Moverse | `W A S D` |
| Mirar alrededor | Mover el mouse |
| Saltar | `Espacio` |
| Romper bloque | Click izquierdo |
| Colocar bloque | Click derecho |
| Elegir bloque | `1`-`8` o rueda del mouse |
| Soltar el mouse | `Esc` |

## 🗂️ Estructura del proyecto

```
minecraft-clone/
├── index.html          # Página principal (monta el <canvas> y carga los módulos)
├── css/
│   └── style.css       # Pantalla de inicio, HUD, hotbar, crosshair
└── js/
    ├── main.js          # Orquesta todo: escena, cámara, loop principal, input de click
    ├── world.js          # Chunks, generación de terreno y meshing (construcción de geometría)
    ├── player.js         # Cámara FPS, físicas, colisiones y raycasting de bloques
    ├── inventory.js       # Hotbar (selección de bloque activo)
    ├── blocks.js          # Catálogo de bloques (id, nombre, si es sólido/transparente, texturas)
    ├── noise.js            # Ruido tipo Perlin (terreno + cuevas)
    └── textures.js          # Genera el atlas de texturas por <canvas> (sin imágenes externas)
```

## ⚙️ Cómo funciona (resumen técnico)

- **Terreno**: se genera por *chunks* de 16×16 bloques usando ruido Perlin fractal (`noise.js`) para la altura del terreno, y ruido 3D para tallar cuevas. Los árboles se ubican de forma pseudoaleatoria (determinística según la posición, así no "parpadean" al recargar).
- **Render de voxels**: cada chunk arma **una sola malla** (`BufferGeometry`) uniendo solo las caras de bloque que están pegadas a aire ("face culling"). Esto es clave para el rendimiento: sin esta optimización, el navegador no aguantaría miles de cubos individuales.
- **Texturas**: se generan en tiempo real con `<canvas>` (un atlas tipo Minecraft de 16×16 px por textura), así el repo no necesita archivos de imagen.
- **Streaming de mundo**: `world.update()` genera los chunks alrededor del jugador (`RENDER_DISTANCE`) y descarga los que quedan lejos, para no consumir memoria indefinidamente.
- **Jugador**: cámara en primera persona con Pointer Lock API, gravedad + colisión por eje contra los bloques (AABB simple).
- **Interacción con bloques**: raycasting tipo *voxel DDA* (Amanatides & Woo) desde la cámara, que recorre el grid de bloques (no la geometría) para saber exactamente a qué bloque apunta la mira.

## 🚀 Desplegar en GitHub Pages

1. **Creá el repositorio**
   - Entrá a [github.com/new](https://github.com/new).
   - Elegí un nombre (ej: `webcraft`), marcalo como **Public**, y creá el repo (sin agregar README, ya lo tenemos).

2. **Subí los archivos**

   Desde la carpeta del proyecto:
   ```bash
   git init
   git add .
   git commit -m "WebCraft: clon de Minecraft en el navegador"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/webcraft.git
   git push -u origin main
   ```

3. **Activá GitHub Pages**
   - En el repo, andá a **Settings → Pages**.
   - En "Build and deployment" → **Source**, elegí **Deploy from a branch**.
   - Elegí la rama **main** y la carpeta **/ (root)**.
   - Guardá. GitHub tarda uno o dos minutos en publicarlo.

4. **Jugá**
   - La URL va a quedar algo así:
     ```
     https://TU-USUARIO.github.io/webcraft/
     ```
   - Cualquiera que entre a esa URL puede jugar directo, sin instalar nada.

> 💡 Tip: si en vez del repo raíz querés que Pages sirva desde `main → /docs`, movés todo el contenido de esta carpeta a `docs/` y elegís esa opción en el paso 3.

## 🧩 Cómo agregar mods sencillos

El proyecto está pensado de forma modular para que sea fácil extenderlo:

- **Bloque nuevo**: agregá una entrada en `BLOCK` y `BLOCK_DATA` (`blocks.js`), indicá qué texturas usa (definilas en `textures.js`), y sumalo a `HOTBAR_BLOCKS` si querés que sea seleccionable. El motor de mundo y de render ya lo dibujan solos.
- **Mob básico (ej: una gallina o un zombie cúbico)**: se puede crear como una clase nueva `js/mobs.js` que use `THREE.Mesh` con cubos (similar a un Minecraft "Steve" de bloques), con su propia lógica de movimiento simple (ej: caminar al azar) y gravedad reusando `world.getBlock()` para no atravesar el piso.
- **Nueva regla de generación de terreno** (ej: biomas de desierto/nieve): se ajusta en `heightAt()` / el loop de `generateChunk()` en `world.js`, por ejemplo usando un segundo `Noise` para decidir el bioma según la posición.

## 🔮 Posibles mejoras futuras

- **Guardado del mundo** en `localStorage` o `IndexedDB` (persistencia entre sesiones).
- **Multijugador** con WebSockets (ej: un pequeño servidor Node con `ws`, sincronizando posiciones y cambios de bloque).
- **Mobs** (animales/enemigos) con IA simple (pathfinding básico, ataques).
- **Sistema de crafteo** e inventario con cantidades limitadas (no creativo infinito).
- **Día/noche** dinámico moviendo el sol y agregando luna/estrellas.
- **Sonidos** (pasos, romper bloques, ambiente) con la Web Audio API.
- **Física de agua** (que fluya) y de arena/gravedad (que caiga).
- **Mejor generación de terreno**: biomas, montañas más realistas, estructuras (aldeas, mazmorras).
- **Greedy meshing** para optimizar aún más el render en distancias de dibujado grandes.
- **Guardar/cargar mapas** como archivos JSON exportables/importables.

## ⚠️ Limitaciones conocidas

Este es un clon simplificado pensado para aprender y como base extensible, no una reimplementación 1:1 de Minecraft: no tiene crafteo, mobs, ni persistencia de mundo todavía, y el rendimiento en mundos muy grandes depende de la GPU del navegador.
