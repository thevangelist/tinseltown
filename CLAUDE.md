# tinseltown, for agents

A zero-dependency custom element, `<tinseltown-backdrop>`, that traces light from an area lamp through a cookie onto a
wall in one WebGL2 fragment shader. Plain ES modules. No build step. No runtime dependencies, and none may be added.

## Public surface

- Element: `<tinseltown-backdrop>`. Attributes are the kebab-case keys of `SCHEMA` in `src/options.js`, plus
  `preset` and `src`. The README table is the user-facing list. Keep the two in sync.
- `element.options`: resolved values. Order is defaults, then preset rig, then attributes. `resolveOptions()`
  clamps every number and rejects unknown enum values and motion tokens. Nothing unvalidated reaches a uniform.
- `element.setCookie(source, { live })`: image, video, canvas or ImageBitmap. `live` re-uploads every frame.
- `PRESETS` in `src/cookies.js`: `{ svg(), rig }` per name.

## Internals

- Coordinates: the wall is the plane z = 0. Presets are composed for `FRAME`, 3.2 by 2 units around the origin.
  `viewExtent()` shows the largest part of the frame with the element's aspect, like `background-size: cover`.
  A preset must keep the line where its cookie plane meets the wall outside the frame. A test holds that. The lamp stands at
  `aim + n * lightDistance`, where `n` comes from azimuth and elevation. Cookies face the lamp.
- `rig()` in `src/optics.js` turns options and time into the uniforms. All motion is computed there, in JS.
- `project()` in `src/optics.js` mirrors `through()` in `src/shader.js`. Change both together.
- Textures are premultiplied. Transmission in the shader is `1 - a + rgb`, per channel. See DEVELOPMENT.md for why.
- The element must not throw into the host page. Shader failure, a lost context and a cookie that fails to load all
  degrade to the flat background with one `console.warn`. Only `setCookie()` throws, to its caller, on a bad source.
- The module must import without a DOM. `test/module.test.js` holds that.
- Two passes. The trace program writes linear light into an RGBA16F target with a running mean over `REFINE_FRAMES`.
  The resolve program tone-maps it to the canvas. Without float targets `uDirect` makes the trace do both.
- Adaptive sampling in the trace shader: `PROBES` spread over the lamp decide whether the full loop runs. The governor
  in `#render` lowers `#quality` when chained frames exceed `SLOW_FRAME_MS`. It never raises it again, to avoid pumping.
- Rendering is on demand. `#invalidate()` schedules one frame. `#render` reschedules only when the rig is animated,
  visible and reduced motion is off.

## Conventions

- Code and comments in English. Comments are rare: one line, only for a constraint a reader would miss.
- No em dashes, emoji or superlatives in docs or page copy. Short sentences. Claim only what the code does today.
  If a feature is not built, the README says so.
- The tagline is "Dynamic Hollywood-style backdrops for any web page. One HTML tag." It appears in README.md, package.json
  and the hero tagline and meta description of index.html. Change all four together.
- A new option needs a `SCHEMA` entry with bounds, a README table row and a test. A new preset is covered by
  `test/cookies.test.js` automatically.
- Run `npm test` and `npm run test:browser` before calling a change done.
- Verify visual changes with a headless screenshot, as in DEVELOPMENT.md. Put scratch files in `reference/`.
