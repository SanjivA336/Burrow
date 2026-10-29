// Draws a black-and-white marble texture (thin white veins on near-black) onto a canvas. Nothing is
// stored: the picture is made fresh whenever it is needed, so every card looks a little different.
// The page recolours it with CSS blend modes (see .update-marble in index.css), so this only has
// to make grey pixels.
//
// How it works, in plain terms: smooth random "noise" is a landscape of gentle hills. Marble veins
// are drawn where that landscape crosses zero (a thin contour line), which naturally gives
// branching, wandering lines. Warping the coordinates with a second noise makes the lines bend,
// and layering three scales gives a few thick veins, some medium ones and a fine web.

// Small on purpose: it is drawn on every open, and the browser scales it up smoothly.
const WIDTH = 512
const HEIGHT = 224

// A small seeded random generator (mulberry32), so one seed always draws the same picture.
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 2D gradient noise (Perlin): smooth, roughly between -1 and 1.
function makeNoise(random: () => number): (x: number, y: number) => number {
  const perm = new Uint8Array(512)
  const order = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = order[i & 255]
  const angles = Array.from({ length: 256 }, () => random() * Math.PI * 2)
  const gx = angles.map(Math.cos)
  const gy = angles.map(Math.sin)
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

  return (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const corner = (cx: number, cy: number) => {
      const h = perm[(perm[(xi + cx) & 255] + yi + cy) & 255]
      return gx[h] * (xf - cx) + gy[h] * (yf - cy)
    }
    const u = fade(xf)
    const v = fade(yf)
    const top = corner(0, 0) + u * (corner(1, 0) - corner(0, 0))
    const bottom = corner(0, 1) + u * (corner(1, 1) - corner(0, 1))
    return (top + v * (bottom - top)) * 1.6
  }
}

// How strongly the veins show at (nx, ny), each 0 to 1. Fainter in the middle, where the caption
// is drawn on top, so the text stays readable whatever the veins do.
function veinStrength(nx: number, ny: number): number {
  const dx = (nx - 0.5) / 0.3
  const dy = (ny - 0.5) / 0.22
  return 1 - 0.6 * Math.exp(-(dx * dx + dy * dy))
}

export function drawMarble(
  canvas: HTMLCanvasElement,
  seed: number = Math.random() * 2 ** 32,
): void {
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const random = seeded(seed)
  const noise = makeNoise(random)
  const [o1, o2, o3, o4] = [random() * 100, random() * 100, random() * 100, random() * 100]
  // A different slant every time, but always roughly diagonal like the photo it replaces.
  const tilt = (-0.2 - random() * 0.45) as number
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const image = ctx.createImageData(WIDTH, HEIGHT)

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const nx = x / WIDTH
      const ny = y / HEIGHT
      const u = nx * 3.4
      const v = ny * 1.5
      const rx = u * cos - v * sin
      const ry = u * sin + v * cos
      // Bend the coordinates so the lines wander instead of running straight, then roughen them a
      // little so the edges look cracked rather than smooth.
      const bx = rx + noise(rx * 0.8 + o1, ry * 0.8) * 0.5
      const by = ry + noise(rx * 0.8, ry * 0.8 + o2) * 0.5
      const px = bx + noise(bx * 9 + o3, by * 9) * 0.03
      const py = by + noise(bx * 9, by * 9 + o4) * 0.03

      // A thin line wherever the noise crosses zero. Each layer is turned to a different angle,
      // so the veins cross and branch into one another like real marble.
      const line = (scale: number, turn: number, offset: number, width: number) => {
        const c = Math.cos(turn)
        const s = Math.sin(turn)
        const tx = px * c - py * s
        const ty = px * s + py * c
        const sx = tx * scale * 0.45 + offset
        const sy = ty * scale * 1.1
        const n = noise(sx, sy)
        // Where the noise is nearly flat, a plain "close to zero" test smears into a wide blur.
        // Dividing by the slope turns it into a true distance from the line, so every line
        // stays about the same thickness.
        const slope = Math.hypot(noise(sx + 0.02, sy) - n, noise(sx, sy + 0.02) - n) / 0.02 + 0.2
        const edge = Math.max(0, 1 - Math.abs(n) / slope / width)
        // Brightness varies along the line, so a vein fades in and out.
        const along = 0.55 + 0.45 * noise(tx * scale * 0.8 + offset, ty * scale * 0.5 + 7)
        return edge * edge * along
      }

      const thick = line(0.8, 0, o3, 0.03)
      const medium = line(2, 0.9, o4, 0.035) * 0.7
      // The fine web comes and goes, so some areas are busy and others calm.
      const cluster = Math.max(0, 0.35 + 0.65 * noise(px * 1.1 + o1, py * 1.1 + o3))
      const fine = line(5, -0.7, o2, 0.04) * 0.5 * cluster

      const vein = Math.min(1, thick + medium + fine) * veinStrength(nx, ny)
      const cloud = 0.07 + 0.03 * noise(px * 2.6 + o4, py * 2.6)
      const value = Math.max(0, Math.min(1, cloud + vein * (1 - cloud)))
      const grey = Math.round(value * 255)
      const i = (y * WIDTH + x) * 4
      image.data[i] = grey
      image.data[i + 1] = grey
      image.data[i + 2] = grey
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}
