# Development

## Setup

```sh
npm install
npm run dev    # demo page on http://localhost:5173
npm test              # unit tests, node --test, no browser
npm run test:browser  # smoke test in headless Chrome, set CHROME_PATH if it is not in /Applications
```

Vite is the only dev dependency and it only serves files. The library ships as plain ES modules with no build step.

## Files

| File | Job |
| --- | --- |
| `src/tinseltown.js` | The custom element. Attributes, cookie loading, WebGL setup, render on demand. |
| `src/shader.js` | The fragment shader. Light integral, cookie lookup, haze march, tone map. |
| `src/options.js` | The option schema. Defaults, bounds, enums. `resolveOptions()` validates everything. |
| `src/optics.js` | Pure rig maths. Lamp and cookie planes, motion, colour temperature, the transmission rule. |
| `src/cookies.js` | Preset cookies as generated SVG strings, each with rig defaults. |
| `test/` | Unit tests for options, optics and presets, plus an import without a DOM. |
| `smoke/` | Browser smoke test: every preset, hostile attributes, context loss, reattach, `setCookie`, a missing file. |
| `index.html`, `demo/` | The landing page. It uses the element as its own backdrop. Design tokens sit at the top of `demo/demo.css`. |
| `demo/rig-controls.js` | `<rig-controls for="id">`: the sliders, colour picker and cookie drop zone, bound to one backdrop. |
| `demo/social.html` | Source of the GitHub social preview, `docs/social.png`. |

## Rules that keep it correct

- `project()` in `optics.js` mirrors the ray and plane step in `through()` in the shader. Change both or neither.
- Cookie textures are uploaded premultiplied. There the transmission rule `1 - alpha * (1 - rgb)` becomes
  `1 - a + rgb`, which stays correct under bilinear filtering and mipmaps. Do not switch to straight alpha.
- Preset SVGs are black and alpha only. Repeating presets wrap their shapes across tile edges with `tiled()`, or the
  tile grid shows up on the wall.
- Penumbra width is `2 * lightSize * cookieDistance / (lightDistance - cookieDistance)`. Keep it below the smallest
  shape of a preset. Above that, leaves turn to mud.
- Everything the element allocates outside the JS heap is released in `disconnectedCallback` or on cookie replace:
  the GL context, observers, the frame request, an owned video.

## Checking a change by eye

Tests cover the maths, not the picture. Render it:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --enable-gpu --use-angle=metal \
  --hide-scrollbars --window-size=1600,900 --virtual-time-budget=4000 \
  --screenshot=reference/shot.png http://localhost:5173/
```

`reference/` is ignored by git. Keep screenshots and test pages there.

The GitHub social preview, `docs/social.png`, is a render of `demo/social.html`. Use the same command with
`--window-size=1280,640 --force-device-scale-factor=2` on `/demo/social.html`, then scale it down with
`sips -z 640 1280`. Every query parameter becomes an attribute of the backdrop, so
`/demo/social.html?preset=leaves&surface=plaster` renders a card for any look. Add `bare` to drop the logo and the line, and
`width` and `height` to size the card.

## Not tested yet

Video cookies, motion over time, reduced motion, the missing WebGL2 path, Safari, Firefox, phones. There is no type
checking and no linter yet. Both come after the first release.

## Release

Bump the version in `package.json`, `package-lock.json`, the JSON-LD block of `index.html` and the CDN lines in
`README.md` and `demo/demo.js`. Date the CHANGELOG entry, commit `chore: release x.y.z`, run both test suites, `npm publish`, tag
`vx.y.z`, push with tags. Then load the published file from the CDN in a blank page and confirm it renders.
