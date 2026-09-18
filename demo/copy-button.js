// <copy-button for="id"> copies the text of that element. text="..." copies a literal, and the .source property
// takes a function for text that changes. One look everywhere: a small icon that turns into a check for two
// seconds. In a row of action buttons, label="..." puts the same icon on a regular button.
const ICONS = {
  copy: 'M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6',
  done: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
}
const FEEDBACK_MS = 2000

class CopyButton extends HTMLElement {
  source
  #timer

  connectedCallback() {
    const label = this.getAttribute('label')
    this.innerHTML = `<button type="button" class="${label ? 'button' : 'copy-icon'}" aria-label="${label ?? 'Copy to clipboard'}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round"/></svg><span aria-live="polite"></span></button>`
    this.firstElementChild.addEventListener('click', () => this.#copy())
    this.#show(false)
  }

  disconnectedCallback() {
    clearTimeout(this.#timer)
  }

  #show(copied) {
    this.toggleAttribute('copied', copied)
    this.querySelector('path').setAttribute('d', copied ? ICONS.done : ICONS.copy)
    const label = this.getAttribute('label')
    this.querySelector('span').textContent = label ? (copied ? 'Copied' : label) : ''
    if (!label) this.firstElementChild.setAttribute('aria-label', copied ? 'Copied' : 'Copy to clipboard')
  }

  async #copy() {
    const text = this.source?.() ?? this.getAttribute('text') ?? document.getElementById(this.getAttribute('for'))?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.warn('copy-button: the clipboard refused', error)
      return
    }
    this.#show(true)
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.#show(false), FEEDBACK_MS)
  }
}

customElements.define('copy-button', CopyButton)
