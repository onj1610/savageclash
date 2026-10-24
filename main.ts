import './styles/main.css'
import './styles/skin.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import { installGamePresentationAssets, observeGameAssetImages } from './engine/asset-urls'
import type { Game } from './game/game'
import { Ui } from './ui/ui'

let bootUi: Ui | undefined

async function boot(): Promise<void> {
  document.title = '原始の夜明け：野生との戦い'
  installGamePresentationAssets()
  observeGameAssetImages(document.documentElement)
  // Hosts that serve the game shell for /enemies: hop to the lab page.
  if (/\/enemies$/.test(location.pathname)) {
    location.replace(`${location.pathname}/${location.search}`)
    return
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let lockLostAt = 0

  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.setQuality(d.quality)
    }
  }
  /** Set once the player picks a quality themselves: the adaptive governor then never overrides it. */
  let manualQuality = false
  const startRun = (fresh: boolean) => {
    if (!game) return
    audio.unlock()
    audio.onTitle = false
    audio.startMusic()
    game.start(fresh)
    ui.show('hud')
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing') return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    input.lockPointer()
  }
  const ui = new Ui(save, {
    newGame: () => startRun(true),
    continueGame: () => startRun(false),
    resume,
    quitToTitle: () => {
      game?.toTitle()
      audio.onTitle = true
      ui.show('title')
      input.unlockPointer()
    },
    keepExploring: () => {
      game?.keepExploring()
      ui.show('hud')
      input.lockPointer()
    },
    settings: patch => {
      if (patch.quality) manualQuality = true
      save.update(patch)
      applySettings(save.data)
    },
    lockPointer: () => input.lockPointer(),
    consumeKeys: () => {
      for (const a of ['satchel', 'pause', 'map', 'help'] as const) input.consume(a)
    },
  })
  bootUi = ui
  ui.show('boot')
  applySettings(save.data)

  ui.setBootProgress(0.05, '島が目覚めています…')
  const [{ Game }, { Renderer, suggestQuality }] = await Promise.all([import('./game/game'), import('./engine/renderer'), document.fonts.ready])
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  game = new Game(renderer, input, audio, ui.hooks(), save.data.quality)
  game.reducedMotion = save.data.reducedMotion
  ui.game = game
  const labels = ['火山を形作っています…', 'ジャングルを育てています…', 'サバンナを広げています…', '黒曜石を冷ましています…', '獣たちが目覚めています…']
  // Stage 1 (blocking): world build + only the title/first-region assets. Later regions stream in the background.
  const { assets } = await import('./engine/assets')
  let fWorld = 0
  let fAssets = 0
  const report = () => {
    const f = fWorld * 0.55 + fAssets * 0.45
    ui.setBootProgress(0.08 + f * 0.92, labels[Math.min(labels.length - 1, Math.floor(f * labels.length))])
  }
  await Promise.all([
    game.load(f => { fWorld = f; report() }),
    assets.loadStage('boot', f => { fAssets = f; report() }),
  ])

  if (import.meta.env.DEV) {
    try {
      const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
      await registerGameTuning(tuning)
    } catch (e) {
      console.warn('tuning bridge unavailable', e)
    }
  }

  const g = game
  let last = performance.now()
  let uiErrorLogged = false
  let stepErrorLogged = false
  // Adaptive quality: sustained low frame rate during play steps quality down one level at a time.
  let frameEma = 1 / 60
  let slowFor = 0
  let governorCooldown = 6
  const frame = (now: number) => {
    // Schedule first: an exception anywhere below must never freeze the game loop.
    requestAnimationFrame(frame)
    const frameSeconds = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    input.update()
    if (input.consume('pause') && performance.now() - lockLostAt > 300) {
      if (g.mode === 'playing' && ui.screen === 'hud') pause()
      else if (g.mode === 'paused' && ui.screen === 'pause') resume()
    }
    if (g.mode !== 'playing') {
      input.consume('light')
      input.consume('heavy')
    }
    // Fixed-size substeps keep combat timing stable on any refresh rate.
    let left = frameSeconds
    while (left > 1e-4) {
      const dt = Math.min(1 / 60, left)
      try {
        g.step(dt)
      } catch (err) {
        // Never let one bad simulation step freeze the hunt; report the first failure.
        if (!stepErrorLogged) { stepErrorLogged = true; console.error('[game] step error', err) }
      }
      left -= dt
      input.endFrame()
    }
    if (g.mode === 'playing' && ui.screen === 'faint') ui.show('hud')
    try {
      ui.frame(frameSeconds)
    } catch (err) {
      // A HUD failure must not skip world rendering; log the first one for debugging.
      if (!uiErrorLogged) { uiErrorLogged = true; console.error('[ui] frame error', err) }
    }
    g.render(frameSeconds)
    input.endFrame()
    if (g.mode === 'playing' && ui.screen === 'hud' && !manualQuality) {
      frameEma += (frameSeconds - frameEma) * 0.08
      governorCooldown = Math.max(0, governorCooldown - frameSeconds)
      slowFor = frameEma > 1 / 24 ? slowFor + frameSeconds : Math.max(0, slowFor - frameSeconds * 2)
      const q = save.data.quality
      if (slowFor > 5 && governorCooldown === 0 && q !== 'low') {
        const next = q === 'high' ? 'medium' : 'low'
        save.update({ quality: next })
        g.setQuality(next)
        ui.refreshSettings()
        ui.toast(`動作を滑らかにするため画質を${next === 'medium' ? '中' : '低'}に変更しました（設定から変更できます）`, 'info')
        slowFor = 0
        governorCooldown = 10
        frameEma = 1 / 60
      }
    }
  }
  requestAnimationFrame(frame)

  document.addEventListener('pointerlockchange', () => {
    input.gameplayMouse = !!document.pointerLockElement
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && g.mode === 'playing' && ui.screen === 'hud' && input.method === 'keyboard') {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  canvas.addEventListener('click', () => {
    if (g.mode === 'playing' && ui.screen === 'hud') input.lockPointer()
  })
  window.addEventListener('beforeunload', () => {
    if (g.mode !== 'title' && g.mode !== 'loading') g.save()
  })
  window.setTimeout(() => ui.show('title'), 150)
  // Stage 2+ (background): highlands then caldera; paused while combat/VFX heat up.
  assets.busy = () => g.isBusy()
  assets.slow = () => g.isSlow()
  window.setTimeout(() => assets.prefetch(['coast', 'highlands', 'caldera']), 600)
  // Title theme starts on the first gesture (browsers block autoplay).
  const firstGesture = () => { audio.unlock(); audio.onTitle = g.mode === 'title'; audio.startMusic() }
  window.addEventListener('pointerdown', firstGesture, { once: true })
  window.addEventListener('keydown', firstGesture, { once: true })
  // Debug/test hook (read-only use): smoke tests inspect state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function showBootFailure(error: unknown): void {
  console.error('[game] startup failed', error)
  if (bootUi) {
    bootUi.showBootError()
    return
  }
  const root = document.getElementById('ui')
  if (!root) return
  const screen = document.createElement('section')
  screen.className = 'screen boot on'
  const brand = document.createElement('div')
  brand.className = 'logo small'
  const title = document.createElement('span')
  title.className = 'logo-title'
  title.textContent = '原始の夜明け：野生との戦い'
  brand.append(title)
  const icon = document.createElement('img')
  icon.className = 'boot-icon'
  icon.dataset.gameAsset = 'share/favicon.png'
  icon.alt = ''
  const message = document.createElement('p')
  message.className = 'muted'
  message.setAttribute('role', 'alert')
  message.textContent = '起動に失敗しました。接続を確認して再試行してください。'
  const retry = document.createElement('button')
  retry.className = 'btn primary'
  retry.type = 'button'
  retry.textContent = '再試行'
  retry.addEventListener('click', () => location.reload())
  screen.append(brand, icon, message, retry)
  root.replaceChildren(screen)
  try {
    installGamePresentationAssets()
    observeGameAssetImages(document.documentElement)
  } catch (assetError) {
    console.warn('[game] retry screen asset setup failed', assetError)
  }
}

boot().catch(showBootFailure)
