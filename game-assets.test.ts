import { describe, expect, it } from 'vitest'
import LOCK from '../assets.lock.json'
import MANIFEST from '../src/engine/manifest.json'
import { gameAssetUrl } from '../src/engine/asset-urls'

type AssetLock = { assets: Record<string, { path: string; sha256: string; size: number }> }
const lock = LOCK as unknown as AssetLock
const stages = Object.entries(MANIFEST).flatMap(([stage, paths]) => paths.map(path => ({ stage, path })))

describe('registered game assets', () => {
  it.each(stages)('$stage: $path resolves to a registered stable URL', ({ path }) => {
    const url = gameAssetUrl(path)
    expect(url).toMatch(/^\/manus-storage\/game\/sha256\/[a-f0-9]{64}\.[a-z0-9]+$/)
    const entry = Object.values(lock.assets).find(asset => asset.path === url)
    expect(entry).toBeDefined()
    expect(entry?.sha256).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(entry?.size).toBeGreaterThan(0)
  })

  it('resolves UI, Japanese font and favicon assets used outside the stage table', () => {
    for (const path of ['ui/button.webp', 'ui/icons/poultice.webp', 'ui/icons/wood.webp', 'fonts/NotoSansJP-subset.woff2', 'share/favicon.png']) {
      expect(gameAssetUrl(path)).toMatch(/^\/manus-storage\/game\/sha256\/[a-f0-9]{64}\.[a-z0-9]+$/)
    }
  })

  it('rejects paths that are not registered', () => {
    expect(() => gameAssetUrl('ui/does-not-exist.webp')).toThrow(/not registered/)
  })
})
