# Changelog

## 0.3.0, 2026-09-18

### Fixed

- Changing an option made the picture flicker for a frame. Every change threw away the refined picture and showed one
  raw, grainy frame. The old picture now fades into the new one over six frames.
- A laptop on a low battery went dark on opening the demo. The element asked for the high-performance GPU, which
  switches on the discrete card on dual-GPU laptops. It now takes the default GPU, renders at up to 1.5 device pixels
  instead of 2, and goes quiet on a draining battery below 30 percent: half scale, 16 samples, no motion.

### Removed

- `surface` and `relief`. The plaster, linen and concrete walls did not look good enough to keep. A set attribute is
  ignored, so pages that used them keep working with a smooth wall.

## 0.2.0, 2026-09-18

### Added

- Colour cookies. Transmission is per channel, so a slide, a gel or a photo tints the light instead of only dimming it.
- A cookie that is not a preset repeats mirrored, so a photo covers any frame without a visible seam.
- Demo: an Examples section, a distraction-free mode on the H key, link previews, a web manifest, icons and
  structured data.

### Changed

- A coloured cookie used to count by its brightness alone. It now tints the light. Black and alpha cookies look the same.

## 0.1.0, 2026-09-18

### Added

- `<tinseltown-backdrop>`: a lamp, a cookie and a wall traced per pixel in one WebGL2 fragment shader, so penumbra,
  keystone stretch and falloff follow the rig instead of a blur radius.
- Nineteen presets generated as SVG, the classic gobo set plus film noir and early cinema: `blinds-horizontal`,
  `blinds-vertical`, `window`, `french-doors`, `arched-window`, `bars`, `chain-link`, `fence`, `staircase`, `bricks`,
  `halftone`, `breakup`, `iris`, `clouds`, `leaves`, `palm`, `palm-tree`, `ceiling-fan`, `train`. Each carries rig defaults tuned so its smallest shape stays legible.
- Custom cookies from any black and alpha image, video or canvas, by `src` or `setCookie()`. One transmission rule
  covers black on transparent and white on black, so no conversion step is needed.
- `cookie-blur` and `threshold`, so a noisy phone photo of a cut-out becomes a clean mask.
- `layers`: up to three copies of the cookie at increasing depth. One sharp layer and one soft layer read as depth.
- `haze`: a drifting smoke volume that makes the beams visible.
- `light-shape`, `light-color` and `light-distance` on the lamp.
- Adaptive sampling. Twelve probes find the pixels that see all of the lamp or none of it, so only the penumbra pays
  for every sample. A governor drops the render scale in steps when frames run long, and phones start a step down.
- Progressive refinement. A still rig averages 24 frames of fresh sample patterns in a float target, so the grain
  that showed at high intensity is gone. Without float targets the element draws directly, as before.
- `motion`: `sway`, `drift`, `spin`, `breathe`, `flicker`.
- Render on demand. A static rig draws once. Animated rigs stop offscreen and hold still under
  `prefers-reduced-motion`.
- A demo landing page that uses the element as its own backdrop, with a controls component and a cookie drop zone.

- Framing that works like `background-size: cover`. World scale was tied to element height, so wide screens ran out
  of lit wall. Now every aspect shows a part of one composed frame.

### Hardened

- Every option is validated against a schema with bounds. A mistyped or hostile attribute is clamped or ignored, so it
  cannot divide by zero, feed NaN to the shader or stall the GPU with a huge sample count.
- A lost WebGL context is restored and the scene redrawn.
- Shader failure and a cookie that fails to load never throw into the host page. They warn once and leave the flat
  background.
- Oversized images are scaled below the GPU texture limit, and the canvas is capped at 4096 pixels a side.
- The module imports without a DOM, so a server render that pulls it in does not crash.
- `setCookie()` rejects a source without a size with a `TypeError`.
- The element marks itself `aria-hidden`, since it is decoration. An author can override that.
