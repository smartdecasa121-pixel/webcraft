// ============================================================
// noise.js - Implementación simple de ruido tipo Perlin.
// No dependemos de librerías externas: generamos el terreno
// con esta función, sembrada (seed) para que el mundo sea
// siempre igual dado el mismo seed.
// ============================================================

export class Noise {
  constructor(seed = 1337) {
    this.seed = seed;
    this.perm = new Uint8Array(512);
    this._buildPermutationTable(seed);
  }

  // Genera una tabla de permutación pseudoaleatoria a partir del seed
  _buildPermutationTable(seed) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;

    // Mezclador simple basado en el seed (LCG - Linear Congruential Generator)
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  _lerp(t, a, b) { return a + t * (b - a); }

  _grad2(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  _grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  // Ruido 2D en el rango aproximado [-1, 1]
  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this._fade(x);
    const v = this._fade(y);
    const p = this.perm;
    const aa = p[X + p[Y]], ab = p[X + p[Y + 1]];
    const ba = p[X + 1 + p[Y]], bb = p[X + 1 + p[Y + 1]];

    return this._lerp(v,
      this._lerp(u, this._grad2(aa, x, y), this._grad2(ba, x - 1, y)),
      this._lerp(u, this._grad2(ab, x, y - 1), this._grad2(bb, x - 1, y - 1))
    );
  }

  // Ruido 3D en el rango aproximado [-1, 1], usado para tallar cuevas
  noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = this._fade(x), v = this._fade(y), w = this._fade(z);
    const p = this.perm;

    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;

    return this._lerp(w,
      this._lerp(v,
        this._lerp(u, this._grad3(p[AA], x, y, z), this._grad3(p[BA], x - 1, y, z)),
        this._lerp(u, this._grad3(p[AB], x, y - 1, z), this._grad3(p[BB], x - 1, y - 1, z))),
      this._lerp(v,
        this._lerp(u, this._grad3(p[AA + 1], x, y, z - 1), this._grad3(p[BA + 1], x - 1, y, z - 1)),
        this._lerp(u, this._grad3(p[AB + 1], x, y - 1, z - 1), this._grad3(p[BB + 1], x - 1, y - 1, z - 1)))
    );
  }

  // Ruido fractal (suma de varias octavas) para un terreno más natural
  fractal2D(x, y, octaves = 4, persistence = 0.5, scale = 1) {
    let total = 0, freq = scale, amp = 1, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * freq, y * freq) * amp;
      maxAmp += amp;
      amp *= persistence;
      freq *= 2;
    }
    return total / maxAmp;
  }
}
