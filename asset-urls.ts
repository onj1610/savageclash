import LOCK from '../../assets.lock.json'

type StoredAsset = { path?: string; sha256?: string }
type LockShape = { assets?: Record<string, StoredAsset> }
const entries = (LOCK as unknown as LockShape).assets ?? {}
const storagePath = /^\/manus-storage\/game\/sha256\/[a-f0-9]{64}\.[a-z0-9]{1,12}$/

/** Resolve a project asset path to its complete, content-addressed managed-storage URL. */
export function gameAssetUrl(path: string): string {
  const relative = path.replace(/^(?:\.\/|\/)+/, '')
  const key = relative.startsWith('assets/') ? relative : `assets/${relative}`
  const entry = entries[key]
  if (!entry?.path || !storagePath.test(entry.path)) {
    throw new Error(`Game asset is not registered in assets.lock.json: ${key}`)
  }
  return entry.path
}

const CSS_ASSETS: Record<string, string> = {
  button: 'ui/button.webp',
  'ring-slot': 'ui/ring-slot.webp',
  'bar-frame': 'ui/bar-frame.webp',
  banner: 'ui/banner.webp',
  reticle: 'ui/reticle.webp',
  'compass-ring': 'ui/compass-ring.webp',
  'crest-boss': 'ui/crest-boss.webp',
}

/** Install content-addressed font faces, CSS image variables, and the game-specific browser icon. */
export function installGamePresentationAssets(): void {
  const css = document.createElement('style')
  css.dataset.gameAssets = 'fonts'
  css.textContent = `
    @font-face { font-family: 'Sora'; src: url("${gameAssetUrl('fonts/Sora-VF.subset.woff2')}") format('woff2'); font-weight: 100 800; font-display: swap; }
    @font-face { font-family: 'Figtree'; src: url("${gameAssetUrl('fonts/Figtree-VF.subset.woff2')}") format('woff2'); font-weight: 300 900; font-display: swap; }
    @font-face { font-family: 'Noto Sans JP'; src: url("${gameAssetUrl('fonts/NotoSansJP-subset.woff2')}") format('woff2'); font-style: normal; font-weight: 100 900; font-display: swap; }
  `
  document.head.append(css)

  for (const [name, path] of Object.entries(CSS_ASSETS)) {
    document.documentElement.style.setProperty(`--game-ui-${name}`, `url("${gameAssetUrl(path)}")`)
  }

  const icon = gameAssetUrl('share/favicon.png')
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.append(link)
  }
  link.type = 'image/png'
  link.href = icon
}

const MANAGED_IMAGE_PATH = /^(?:\.\/|\/)?(ui|share)\/(.+)$/

/** Rewrite the source game's logical image paths to registered, complete managed-storage URLs. */
export function observeGameAssetImages(root: ParentNode): MutationObserver {
  const resolve = (node: Element): void => {
    if (node instanceof HTMLImageElement && node.hasAttribute('data-game-asset')) {
      const declared = node.getAttribute('data-game-asset') ?? ''
      node.setAttribute('src', gameAssetUrl(declared))
      node.removeAttribute('data-game-asset')
    } else if (node instanceof HTMLImageElement) {
      const source = node.getAttribute('src') ?? ''
      const match = source.match(MANAGED_IMAGE_PATH)
      if (match) node.setAttribute('src', gameAssetUrl(`${match[1]}/${match[2]}`))
    }
    if (node.querySelectorAll) {
      for (const child of node.querySelectorAll('[data-game-asset], img[src]')) resolve(child)
    }
  }

  resolve(root as Element)
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') resolve(record.target as Element)
      for (const node of record.addedNodes) if (node instanceof Element) resolve(node)
    }
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'data-game-asset'],
  })
  return observer
}
