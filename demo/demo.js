import { PRESETS } from '../src/cookies.js'
import './rig-controls.js'

const backdrop = document.querySelector('#backdrop')
const controls = document.querySelector('rig-controls')
const chips = document.querySelector('#presets')
const snippet = document.querySelector('#snippet')

function show() {
  for (const chip of chips.children) chip.setAttribute('aria-pressed', chip.dataset.preset === backdrop.getAttribute('preset'))
  snippet.textContent = `<script type="module" src="https://cdn.jsdelivr.net/npm/tinseltown@0.1/src/tinseltown.js"></script>\n\n${controls.tag}`
}

for (const name of Object.keys(PRESETS)) {
  const label = name.replaceAll('-', ' ')
  const chip = Object.assign(document.createElement('button'), { type: 'button', textContent: label[0].toUpperCase() + label.slice(1) })
  chip.dataset.preset = name
  chip.addEventListener('click', () => {
    backdrop.setAttribute('preset', name)
    controls.reset()
  })
  chips.append(chip)
}
controls.addEventListener('change', show)
show()

// Distraction-free mode: H or the eye hides the interface, Esc or the button brings it back.
const eye = document.querySelector('#focus')
function setFocus(on) {
  document.body.classList.toggle('focus', on)
  eye.setAttribute('aria-pressed', on)
  ;(on ? document.querySelector('#focus-exit') : eye).focus({ preventScroll: true })
}
eye.addEventListener('click', () => setFocus(true))
document.querySelector('#focus-exit').addEventListener('click', () => setFocus(false))
addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea') || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Escape') setFocus(false)
  if (event.key === 'h' || event.key === 'H') setFocus(!document.body.classList.contains('focus'))
})

// The glow follows the pointer along the menu and rests on the section in the middle of the screen.
const menu = document.querySelector('.nav nav')
const blob = menu.appendChild(Object.assign(document.createElement('span'), { className: 'blob' }))
const current = () => menu.querySelector('[aria-current]')
function glow(x) {
  blob.style.opacity = x === undefined ? 0 : 1
  if (x !== undefined) blob.style.transform = `translate(${x - blob.offsetWidth / 2}px, -50%)`
}
const spot = link => glow(link ? link.offsetLeft + link.offsetWidth / 2 : undefined)
menu.addEventListener('pointermove', event => glow(event.clientX - menu.getBoundingClientRect().left))
menu.addEventListener('focusin', event => spot(event.target.closest('a')))
menu.addEventListener('pointerleave', () => spot(current()))

const links = new Map([...menu.querySelectorAll('a')].map(link => [link.hash.slice(1), link]))
const onAir = new IntersectionObserver(entries => {
  for (const { target, isIntersecting } of entries) links.get(target.id).toggleAttribute('aria-current', isIntersecting)
  if (!menu.matches(':hover')) spot(current())
}, { rootMargin: '-45% 0px -45% 0px' })
for (const id of links.keys()) onAir.observe(document.getElementById(id))
