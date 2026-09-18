// Presets are K+A SVGs: black blocks light, white or transparent passes it.
const SIZE = 1000

const rng = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const svg = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`

const board = holes => `<rect width="${SIZE}" height="${SIZE}"/><g fill="#fff">${holes}</g>`

// Repeats the body across the 8 neighbouring tiles so shapes crossing an edge wrap seamlessly.
const tiled = body => {
  const copies = [-SIZE, 0, SIZE].flatMap(x => [-SIZE, 0, SIZE].map(y => (x || y ? `<use href="#t" x="${x}" y="${y}"/>` : '')))
  return `<g id="t">${body}</g>${copies.join('')}`
}

const leaf = (x, y, angle, length, width) =>
  `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 0Q${length / 2} ${-width} ${length} 0Q${length / 2} ${width} 0 0"/>`

function blob(cx, cy, radius, rand) {
  const count = 5 + Math.floor(rand() * 4)
  const points = Array.from({ length: count }, (_, i) => {
    const a = ((i + rand() * 0.6) / count) * Math.PI * 2, r = radius * (0.3 + 0.9 * rand())
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const start = mid(points.at(-1), points[0])
  const curves = points.map((p, i) => `Q${p} ${mid(p, points[(i + 1) % points.length])}`)
  return `<path d="M${start}${curves.join('')}Z"/>`
}

function panes(cols, rows, bar = 28, frame = 70) {
  const w = (SIZE - 2 * frame - (cols - 1) * bar) / cols, h = (SIZE - 2 * frame - (rows - 1) * bar) / rows
  let holes = ''
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++)
      holes += `<rect x="${frame + c * (w + bar)}" y="${frame + r * (h + bar)}" width="${w}" height="${h}"/>`
  return holes
}

function blinds(slats = 16, frame = 60) {
  const pitch = (SIZE - 2 * frame) / slats
  let gaps = ''
  for (let i = 0; i < slats; i++)
    gaps += `<rect x="${frame}" y="${frame + i * pitch}" width="${SIZE - 2 * frame}" height="${pitch * 0.4}"/>`
  const cords = [0.22, 0.78].map(x => `<rect x="${SIZE * x}" y="${frame}" width="5" height="${SIZE - 2 * frame}" fill="#000"/>`)
  return board(gaps) + cords.join('')
}

function breakup() {
  const rand = rng(7), cells = 6, cell = SIZE / cells
  let holes = ''
  for (let c = 0; c < cells; c++)
    for (let r = 0; r < cells; r++)
      holes += blob((c + 0.5 + (rand() - 0.5) * 0.5) * cell, (r + 0.5 + (rand() - 0.5) * 0.5) * cell, cell * 0.42, rand)
  return `<rect width="${SIZE}" height="${SIZE}"/><g fill="#fff">${tiled(holes)}</g>`
}

function halftone(rows = 30) {
  const pitch = SIZE / rows
  let holes = ''
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < rows; col++) {
      const x = (col + (row % 2 ? 1 : 0.5)) * pitch, y = (row + 0.5) * pitch
      const level = 1 - Math.hypot(x - SIZE / 2, y - SIZE / 2) / (SIZE / 2)
      if (level > 0.03) holes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(pitch * 0.5 * Math.sqrt(level)).toFixed(1)}"/>`
    }
  return board(holes)
}

function leaves() {
  const rand = rng(11)
  let body = ''
  for (let twig = 0; twig < 12; twig++) {
    const x = rand() * SIZE, y = rand() * SIZE, angle = rand() * 360, length = 180 + rand() * 160
    let sprigs = `<rect width="${length}" height="5" y="-2.5"/>`
    for (let i = 0; i < 8; i++)
      sprigs += leaf(20 + (i / 8) * length, 0, (i % 2 ? 1 : -1) * (35 + rand() * 30), 70 + rand() * 60, 18 + rand() * 12)
    body += `<g transform="translate(${x} ${y}) rotate(${angle})">${sprigs}</g>`
  }
  return tiled(body)
}

function palm() {
  const rand = rng(3)
  let body = ''
  for (const [angle, length] of [[-62, 1150], [-38, 1250], [-14, 1100]]) {
    let frond = `<path d="M0 0Q${length / 2} -120 ${length} 60" fill="none" stroke="#000" stroke-width="9"/>`
    for (let i = 4; i < 60; i++) {
      const t = i / 60, x = t * length, y = -240 * t * (1 - t) + 60 * t * t
      const slope = (Math.atan2(-240 * (1 - 2 * t) + 120 * t, length) * 180) / Math.PI
      const reach = 260 * Math.sin(Math.PI * Math.min(1, t + 0.12)) + 40
      for (const side of [-1, 1]) frond += leaf(x, y, slope + side * (58 - 25 * t + rand() * 8), reach, 11)
    }
    body += `<g transform="translate(-60 1060) rotate(${angle})">${frond}</g>`
  }
  return body
}

function palmTree() {
  const rand = rng(5), crown = [560, 330]
  let body = `<path d="M352 1000Q470 640 ${crown[0] - 9} ${crown[1]}L${crown[0] + 9} ${crown[1]}Q520 650 410 1000Z"/>`
  for (let i = 0; i < 13; i++) {
    const heading = ((-205 + i * 19 + rand() * 8) * Math.PI) / 180
    const length = 330 + rand() * 110, droop = 170 + rand() * 120
    const at = t => [crown[0] + length * t * Math.cos(heading), crown[1] + length * t * Math.sin(heading) + droop * t * t]
    body += `<path d="M${crown}Q${at(0.5).map((v, k) => v - (k ? droop / 4 : 0))} ${at(1)}" fill="none" stroke="#000" stroke-width="6"/>`
    for (let t = 0.1; t < 1; t += 0.03) {
      const tangent = (Math.atan2(length * Math.sin(heading) + 2 * droop * t, length * Math.cos(heading)) * 180) / Math.PI
      const reach = 95 * Math.sin(Math.PI * t ** 0.7) + 18
      for (const side of [-1, 1]) body += leaf(...at(t), tangent + side * (62 - 28 * t) + (90 - tangent) * 0.25, reach, 7)
    }
  }
  for (const [x, y] of [[-14, 8], [12, 14], [0, 26]]) body += `<circle cx="${crown[0] + x}" cy="${crown[1] + y}" r="15"/>`
  return body
}

function fence(pickets = 20) {
  const pitch = SIZE / pickets, w = pitch * 0.62
  let body = `<rect y="520" width="${SIZE}" height="38"/><rect y="820" width="${SIZE}" height="38"/>`
  for (let i = 0; i < pickets; i++) {
    const x = i * pitch + (pitch - w) / 2
    body += `<path d="M${x} 1000V440L${x + w / 2} 380L${x + w} 440V1000Z"/>`
  }
  return body
}

function staircase(steps = 9) {
  const run = SIZE / steps, rise = 78
  let body = `<path d="M0 ${SIZE - steps * rise - 330}L${SIZE} ${SIZE - 330}" fill="none" stroke="#000" stroke-width="34"/>`
  for (let i = 0; i < steps; i++) {
    const x = i * run, tread = SIZE - (steps - i) * rise
    body += `<rect x="${x}" y="${tread}" width="${run + 1}" height="${SIZE - tread}"/>`
    for (const offset of [0.3, 0.75]) {
      const bx = x + run * offset, top = SIZE - steps * rise - 330 + (bx / SIZE) * steps * rise
      body += `<rect x="${bx - 7}" y="${top}" width="14" height="${tread - top}"/>`
    }
  }
  return body
}

function bricks(rows = 20, columns = 8, mortar = 10) {
  const w = SIZE / columns, h = SIZE / rows
  let holes = ''
  for (let row = 0; row < rows; row++)
    for (let col = -1; col < columns; col++)
      holes += `<rect x="${(col + (row % 2) / 2) * w + mortar / 2}" y="${row * h + mortar / 2}" width="${w - mortar}" height="${h - mortar}"/>`
  return board(holes)
}

function bars(count = 9) {
  let body = `<rect y="120" width="${SIZE}" height="46"/><rect y="840" width="${SIZE}" height="46"/>`
  for (let i = 0; i < count; i++) body += `<rect x="${(i + 0.5) * (SIZE / count) - 17}" width="34" height="${SIZE}"/>`
  return body
}

function archedWindow() {
  let holes = ''
  for (const [x, w] of [[150, 320], [530, 320]]) {
    holes += `<path d="M${x} 470V${300}A${w / 2} 200 0 0 1 ${x + w} 300V470Z"/>`
    for (const y of [510, 730]) holes += `<rect x="${x}" y="${y}" width="${w}" height="180"/>`
  }
  return board(holes)
}

function fan(blades = 4) {
  let body = '<circle cx="500" cy="500" r="70"/>'
  for (let i = 0; i < blades; i++)
    body += `<path transform="rotate(${(i * 360) / blades} 500 500)" d="M500 470Q760 380 960 450Q990 500 960 550Q760 620 500 530Z"/>`
  return body
}

function chainLink(cells = 12) {
  const pitch = SIZE / cells
  let body = ''
  for (let i = -cells; i <= cells * 2; i++)
    for (const sign of [1, -1]) body += `<path d="M${i * pitch} 0L${i * pitch + sign * SIZE} ${SIZE}" fill="none" stroke="#000" stroke-width="9"/>`
  return body
}

function train(windows = 4) {
  const pitch = SIZE / windows
  let holes = ''
  for (let i = 0; i < windows; i++) holes += `<rect x="${i * pitch + pitch * 0.14}" y="300" width="${pitch * 0.72}" height="400" rx="26"/>`
  return board(holes)
}

// Soft noise as alpha on black. stitchTiles keeps it seamless under edge repeat.
const clouds = () => `<filter id="c" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves="4" seed="4" stitchTiles="stitch"/>
<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3.4 0 0 0 -1.3"/></filter>
<rect width="${SIZE}" height="${SIZE}" filter="url(#c)"/>`

const FREE_RIG = { edge: 'pass', cookieDistance: 1.7, cookieScale: 2.5, lightSize: 0.04 }
const WINDOW_RIG = { edge: 'block', cookieDistance: 1.6, cookieScale: 1.6, lightSize: 0.085, elevation: 38 }
const BLINDS_RIG = { ...WINDOW_RIG, cookieScale: 2.2, colorTemp: 3400 }

export const PRESETS = {
  'blinds-horizontal': { svg: () => svg(blinds()), rig: BLINDS_RIG },
  'blinds-vertical': { svg: () => svg(`<g transform="rotate(90 500 500)">${blinds()}</g>`), rig: BLINDS_RIG },
  window: { svg: () => svg(board(panes(2, 2))), rig: { ...WINDOW_RIG, colorTemp: 4800 } },
  'french-doors': { svg: () => svg(board(panes(4, 5, 24))), rig: { ...WINDOW_RIG, cookieScale: 1.9, colorTemp: 4300 } },
  halftone: { svg: () => svg(halftone()), rig: { edge: 'block', cookieDistance: 1.6, cookieScale: 2.8, lightSize: 0.03, colorTemp: 3000 } },
  breakup: { svg: () => svg(breakup()), rig: { cookieDistance: 1.5, cookieScale: 2.6, lightSize: 0.2 } },
  leaves: { svg: () => svg(leaves()), rig: { layers: 2, motion: 'sway', cookieDistance: 1.6, cookieScale: 2.2, lightSize: 0.035, colorTemp: 5200 } },
  'palm-tree': { svg: () => svg(palmTree()), rig: { ...FREE_RIG, cookieScale: 1.7, elevation: 55, motion: 'sway', colorTemp: 3600 } },
  fence: { svg: () => svg(fence()), rig: { ...FREE_RIG, elevation: 30, colorTemp: 3800 } },
  staircase: { svg: () => svg(staircase()), rig: { ...FREE_RIG, colorTemp: 3400 } },
  bricks: { svg: () => svg(bricks()), rig: { cookieDistance: 1.6, cookieScale: 2.6, lightSize: 0.04 } },
  clouds: { svg: () => svg(clouds()), rig: { motion: 'drift', cookieDistance: 2.2, cookieScale: 4, lightSize: 0.3, colorTemp: 5600 } },
  bars: { svg: () => svg(bars()), rig: { ...FREE_RIG, cookieScale: 3, colorTemp: 5200 } },
  'arched-window': { svg: () => svg(archedWindow()), rig: { ...WINDOW_RIG, cookieScale: 2, colorTemp: 4400 } },
  'ceiling-fan': { svg: () => svg(fan()), rig: { ...FREE_RIG, cookieScale: 2.2, elevation: 70, lightSize: 0.1, motion: 'spin', colorTemp: 3000 } },
  'chain-link': { svg: () => svg(chainLink()), rig: { cookieDistance: 1.6, cookieScale: 2.4, lightSize: 0.03, colorTemp: 4800 } },
  iris: { svg: () => svg(board('<circle cx="500" cy="500" r="330"/>')), rig: { ...WINDOW_RIG, cookieScale: 1.5, elevation: 80, lightSize: 0.12, colorTemp: 4000 } },
  train: { svg: () => svg(train()), rig: { motion: 'drift', speed: 10, cookieDistance: 1.7, cookieScale: 2.6, elevation: 35, lightSize: 0.12, colorTemp: 3000 } },
  palm: { svg: () => svg(palm()), rig: { edge: 'pass', motion: 'sway', cookieDistance: 1.6, cookieScale: 2.4, lightSize: 0.04, colorTemp: 4000 } },
}
