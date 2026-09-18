// <rig-controls for="backdrop-id">: every knob of one <tinseltown-backdrop> in a single well.
// Renders in the light DOM so the page's one well style applies. Fires "change" after every edit.
import { PRESETS } from '../src/cookies.js'
import './copy-button.js'

const kebab = key => key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

// A row is a range (min, max, step), a list of [label, value] choices, a colour or a boolean. `random` is the narrower range Randomize draws from.
const COLUMNS = [
  [['Light', [
    { option: 'lightSize', label: 'Size', min: 0.01, max: 0.6, step: 0.01, random: [0.02, 0.25] },
    { option: 'lightDistance', label: 'Distance', min: 2, max: 30, step: 0.5 },
    { option: 'lightShape', label: 'Shape', choices: [['Disc', 'disc'], ['Square', 'square'], ['Ring', 'ring']] },
    { option: 'elevation', label: 'Elevation', min: 12, max: 90, step: 1, random: [22, 70] },
    { option: 'azimuth', label: 'Azimuth', min: 0, max: 360, step: 1, random: [0, 360] },
    { option: 'colorTemp', label: 'Temperature', min: 1800, max: 9000, step: 100, random: [2200, 7000] },
    { option: 'lightColor', label: 'Gel', choices: [['None', ''], ['Amber', '#ffb347'], ['Red', '#ff3b30'], ['Magenta', '#ff4dd8'], ['Blue', '#3d6bff'], ['Cyan', '#4dd2ff'], ['Green', '#4dff88']] },
    { option: 'intensity', label: 'Intensity', min: 0.2, max: 6, step: 0.1, random: [1.6, 3.6] },
    { option: 'ambient', label: 'Fill', min: 0, max: 0.6, step: 0.01 },
    { option: 'haze', label: 'Haze', min: 0, max: 1, step: 0.02 },
  ]]],
  [['Cookie', [
    { option: 'cookieDistance', label: 'Distance', min: 0.2, max: 4, step: 0.05, random: [1.2, 2.6] },
    { option: 'cookieScale', label: 'Scale', min: 1, max: 6, step: 0.1, random: [1.6, 4] },
    { option: 'cookieBlur', label: 'Blur', min: 0, max: 8, step: 0.1 },
    { option: 'threshold', label: 'Threshold', min: 0, max: 1, step: 0.01 },
    { option: 'invert', label: 'Invert', boolean: true },
  ]], ['Wall', [
    { option: 'wall', label: 'Colour', color: true },
  ]]],
]
const ROWS = COLUMNS.flat().flatMap(([, rows]) => rows)

function input({ option, min, max, step, choices, color, boolean }) {
  if (boolean) return `<input type="checkbox" data-option="${option}">`
  if (choices) return `<select data-option="${option}">${choices.map(([label, value]) => `<option value="${value}">${label}</option>`).join('')}</select>`
  if (color) return `<input type="color" data-option="${option}">`
  return `<input type="range" data-option="${option}" min="${min}" max="${max}" step="${step}">`
}
const row = spec => `<label${spec.color ? ' class="color"' : ''}>${spec.label}${input(spec)}<output></output></label>`
const DICE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="M6 2h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4ZM5.6 7a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0ZM11.6 7a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0ZM8.6 10a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0ZM5.6 13a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0ZM11.6 13a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0Z"/></svg>'
const group = ([title, rows]) => `<h3>${title}</h3>${rows.map(row).join('')}`

class RigControls extends HTMLElement {
  #target
  #dropped = {}

  // The tag that reproduces the backdrop as it looks now.
  get tag() {
    const attributes = [...this.#target.attributes].filter(a => !['id', 'style', 'class', 'aria-hidden'].includes(a.name))
    return `<tinseltown-backdrop${attributes.map(a => `\n  ${a.name}="${a.value}"`).join('')}>\n</tinseltown-backdrop>`
  }

  connectedCallback() {
    this.#target = document.getElementById(this.getAttribute('for'))
    this.innerHTML = `<div class="well">
      <form class="controls">${COLUMNS.map(groups => `<div>${groups.map(group).join('')}</div>`).join('')}</form>
      <hr>
      <label class="drop"><span><h3>Your own cookie</h3>
        <small>An image or a video. Black blocks light, clear lets it through. Drop it here or choose it. The file stays
          in your browser.</small></span>
        <input type="file" accept="image/*,video/*" hidden><span class="button">Choose a file</span></label>
      <hr>
      <div class="actions"><button type="button" class="button primary hint" data-action="randomize">${DICE}Randomize</button>
        <button type="button" class="button" data-action="reset">Reset</button>
        <copy-button label="Copy tag"></copy-button></div>
    </div>`

    this.addEventListener('input', ({ target }) => {
      if (!target.dataset.option) return
      if (target.type === 'checkbox') this.#target.toggleAttribute(kebab(target.dataset.option), target.checked)
      else this.#target.setAttribute(kebab(target.dataset.option), target.value)
      this.sync()
    })
    this.addEventListener('click', ({ target }) => {
      const button = target.closest('[data-action]')
      if (button) this[button.dataset.action](button)
    })
    this.querySelector('copy-button').source = () => this.tag
    const drop = this.querySelector('.drop')
    drop.querySelector('input').addEventListener('change', event => this.#useFile(event.target.files[0]))
    for (const type of ['dragover', 'dragleave', 'drop'])
      drop.addEventListener(type, event => {
        event.preventDefault()
        drop.classList.toggle('over', type === 'dragover')
        if (type === 'drop') this.#useFile(event.dataTransfer.files[0])
      })
    this.sync()
  }

  disconnectedCallback() {
    this.#release()
  }

  // Clears every override so a newly picked preset shows its own rig.
  reset() {
    for (const { option } of ROWS) this.#target.removeAttribute(kebab(option))
    this.sync()
  }

  // A random preset under a random rig. Haze joins in one time out of three.
  randomize(button) {
    button?.classList.remove('hint')
    const pick = ([lo, hi], step) => Number((Math.round((lo + Math.random() * (hi - lo)) / step) * step).toFixed(2))
    const names = Object.keys(PRESETS)
    this.#target.setAttribute('preset', names[Math.floor(Math.random() * names.length)])
    for (const { option, step, random, choices } of ROWS) {
      if (random) this.#target.setAttribute(kebab(option), pick(random, step))
    }
    this.#target.setAttribute('haze', Math.random() < 0.33 ? pick([0.15, 0.5], 0.02) : 0)
    this.sync()
  }

  sync() {
    const options = this.#target.options
    for (const control of this.querySelectorAll('[data-option]')) {
      control.value = options[control.dataset.option]
      control.checked = options[control.dataset.option] === true
      control.nextElementSibling.value = control.type === 'range' ? Number(control.value) : control.type === 'color' ? control.value : ''
    }
    this.dispatchEvent(new Event('change'))
  }

  #release() {
    this.#dropped.video?.pause()
    URL.revokeObjectURL(this.#dropped.url)
    this.#dropped = {}
  }

  async #useFile(file) {
    if (!file) return
    this.#release()
    const url = URL.createObjectURL(file)
    this.#dropped = { url }
    try {
      if (file.type.startsWith('video/')) {
        const video = Object.assign(document.createElement('video'), { src: url, muted: true, loop: true, playsInline: true })
        await video.play()
        this.#dropped.video = video
        this.#target.setCookie(video)
      } else {
        const image = Object.assign(new Image(), { src: url })
        await image.decode()
        this.#target.setCookie(image)
      }
    } catch (error) {
      console.warn('rig-controls: could not use that file', error)
    }
  }
}

customElements.define('rig-controls', RigControls)
