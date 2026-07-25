const DEFAULT_ORIGIN = 'https://www.html-docs.com'

export interface HtmlDocsVideoAttributes {
  share?: string | null
  src?: string | null
  poster?: string | null
  title?: string | null
  origin?: string | null
  aspect?: string | null
}

export function buildPlayerUrl(
  share: string,
  origin = DEFAULT_ORIGIN,
  embed = true,
): string {
  const normalizedCode = share.trim()
  if (!/^[a-f0-9]{10}$/i.test(normalizedCode)) {
    throw new Error('HTML Docs video share codes contain exactly 10 hexadecimal characters.')
  }
  const url = new URL(`/v/${normalizedCode.toLowerCase()}`, origin)
  if (embed) url.searchParams.set('embed', '1')
  return url.toString()
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const HTMLElementBase = typeof HTMLElement === 'undefined'
  ? class {} as typeof HTMLElement
  : HTMLElement

export class HtmlDocsVideoElement extends HTMLElementBase {
  static get observedAttributes() {
    return ['share', 'src', 'poster', 'title', 'origin', 'aspect']
  }

  connectedCallback() {
    this.render()
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render()
  }

  private render() {
    const attrs: HtmlDocsVideoAttributes = {
      share: this.getAttribute('share'),
      src: this.getAttribute('src'),
      poster: this.getAttribute('poster'),
      title: this.getAttribute('title') || 'HTML Docs video',
      origin: this.getAttribute('origin') || DEFAULT_ORIGIN,
      aspect: this.getAttribute('aspect') || '16 / 9',
    }
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    const title = escapeAttribute(attrs.title ?? 'HTML Docs video')
    const poster = attrs.poster ? ` poster="${escapeAttribute(attrs.poster)}"` : ''
    const fallback = attrs.src
      ? `<video controls playsinline preload="metadata" src="${escapeAttribute(attrs.src)}"${poster} aria-label="${title}"></video>`
      : `<div class="empty" role="status">Video preview is not available.</div>`
    let content = fallback
    if (attrs.share) {
      try {
        const playerUrl = buildPlayerUrl(attrs.share, attrs.origin ?? DEFAULT_ORIGIN)
        content = `<iframe title="${title}" src="${escapeAttribute(playerUrl)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe><noscript>${fallback}</noscript>`
      } catch {
        content = fallback
      }
    }
    root.innerHTML = `
      <style>
        :host{display:block;width:100%;color-scheme:dark}
        .frame{position:relative;overflow:hidden;width:100%;aspect-ratio:${attrs.aspect};border-radius:18px;background:#0b0b0a;box-shadow:0 24px 70px rgba(0,0,0,.22)}
        iframe,video{display:block;width:100%;height:100%;border:0;object-fit:contain;background:#0b0b0a}
        .empty{display:grid;height:100%;place-items:center;padding:2rem;color:#aaa;font:600 14px/1.4 ui-sans-serif,system-ui}
        @media (max-width:640px){.frame{border-radius:12px}}
      </style>
      <div class="frame">${content}</div>
    `
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('html-docs-video')) {
  customElements.define('html-docs-video', HtmlDocsVideoElement)
}
