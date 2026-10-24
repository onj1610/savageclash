import * as THREE from 'three'
import { CAMP_STAGES, GEAR, ITEMS, MEALS, MEAL_ORDER, RECIPES, SEAR_ZONES, SPECIES, TOWER_COST, TRACKING, WEAPON_CLASSES, type Cost, type GearId, type ItemId, type MealId, type RecipeDef, type SearQuality, type SpeciesId } from '../game/data'
import { cookState, count, gearStats, knowledge, missing, nextCampStage, recipeState, towerState, weaponClass } from '../game/rules'
import { ARENAS, REGION_NAMES, WORLD } from '../game/terrain'
import { CAMP } from '../game/camp'
import type { Game, Hooks, MenuTab, PopupKind, StampKind } from '../game/game'
import type { SaveData, SaveStore } from '../engine/save'
import { gearIcon, icon } from './icons'
import { UiFx } from './uifx'

/** Painted item icons (public/ui/icons/<id>.webp); SVG fallback for anything else. */
const PAINTED = new Set<string>(['amber', 'ashfangPelt', 'bone', 'emberCarapace', 'fiber', 'flint', 'herb', 'hogTusk', 'hornShard', 'magmaHeart', 'obsidian', 'poultice', 'roughHide', 'ruinCrest', 'ruinPlate', 'scorchScale', 'snapperScale', 'stalkerClaw', 'stalkerHide', 'stone', 'sulfur', 'wood', 'meat', 'glowcap', 'snare', 'pitfall', 'flashPod'])
function itemIcon(id: ItemId, size: number): string {
  const it = ITEMS[id]
  return PAINTED.has(id) ? `<img class="pi" src="./ui/icons/${id}.webp" width="${size}" height="${size}" alt="" draggable="false">` : icon(it.icon, it.color, size)
}
const PAINTED_GEAR = new Set<string>(['boneSpear', 'stalkerLance', 'reedSling', 'sinewSling', 'flintHatchet', 'flintPick'])
const LOGO = '<span class="logo-title">原始の夜明け：野生との戦い</span>'

export type Screen = 'boot' | 'title' | 'hud' | 'menu' | 'pause' | 'faint' | 'victory'
export type { MenuTab }
const TABS: MenuTab[] = ['materials', 'craft', 'cook', 'camp', 'gear', 'journal']
export type UiActions = {
  newGame(): void
  continueGame(): void
  resume(): void
  quitToTitle(): void
  keepExploring(): void
  settings(patch: Partial<SaveData>): void
  lockPointer(): void
  consumeKeys(): void
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}時間${String(m % 60).padStart(2, '0')}分` : `${m}分${String(Math.floor(s % 60)).padStart(2, '0')}秒`
}
const ROMAN = ['0', 'I', 'II', 'III']

const CONTROLS: [string, string][] = [
  ['W A S D', '移動'],
  ['マウス', '周囲を見る'],
  ['左クリック・J', '弱攻撃（3連撃）'],
  ['右クリック長押し・K', '溜め強攻撃（3段階）'],
  ['Space', '回避ローリング（無敵・スタミナ消費）'],
  ['Shift', 'ダッシュ'],
  ['E', '採取 · 剥ぎ取り · キャンプを使う'],
  ['1 2 3 4 · F', '武器 · 手斧 · ピッケル · 素手に持ち替え'],
  ['木／岩を攻撃', '木材を伐採 · 石を採掘'],
  ['G', '道具を使う：くくり罠 · 落とし穴 · 閃光玉'],
  ['C', '道具を切り替え'],
  ['痕跡のそばでE', '手がかりを調べる（3つで追跡可能）'],
  ['B', '狩猟日誌'],
  ['Q · マウス中ボタン', 'ロックオン／解除'],
  ['R', '薬草を使う'],
  ['Tab', 'ポーチとクラフト'],
  ['M', '島の地図'],
  ['H', '操作方法'],
  ['Esc', '一時停止'],
]
const TIPS = [
  '<b>赤い範囲</b>は攻撃の着弾地点です。塗りつぶしで攻撃までの時間がわかります。',
  '獣に<b class="open">隙あり</b>と表示されたら回復中です。攻撃ダメージが<b>+30%</b>になります。',
  '強攻撃で体勢を崩し、<b>ひるませる</b>ことができます。背後からの攻撃は追加ダメージ。',
  '攻撃を直前にローリングでかわすと、スタミナが回復します。',
  '攻撃中は動作を中断できません。後隙の間だけ、連続攻撃か回避に移れます。',
  '<b>槍：</b>ジャスト回避の直後に攻撃すると<b>カウンター突き</b>が発動し、大ダメージ。',
  '<b>投石器：</b>石を遠距離に発射します。頭に溜め撃ちを当てるとひるませます。',
  '<b>くくり罠</b>は突進する獣を転ばせ、<b>閃光玉</b>は攻撃の予備動作を中断させます。同じ手をすぐ使うと獣が学習し、効きにくくなります。',
  '狩りの前にかまどで<b>料理</b>を食べましょう。焼き加減を金色の範囲で止めると効果が長持ちします。',
  '<b>木</b>を叩くと木材、<b>岩</b>を叩くと石が手に入ります。何でも使えますが、<b>手斧</b>や<b>ピッケル</b>なら効率的です。',
]

type Popup = { el: HTMLElement; pos: THREE.Vector3; t: number; life: number }

export class Ui {
  readonly root: HTMLElement
  screen: Screen = 'boot'
  game?: Game
  private tab: MenuTab = 'materials'
  private el: Record<string, HTMLElement> = {}
  private popups: Popup[] = []
  private feed: { id: ItemId; n: number; t: number; el: HTMLElement }[] = []
  private bannerT = 0
  private tipT = 0
  private toastT = 0
  private hurtT = 0
  private mapOpen = false
  private helpOpen = false
  private lastPrompt = ''
  private lastObjective = ''
  private objectiveFlash = 0
  readonly fx: UiFx
  private lastLootId: ItemId | null = null
  private lastStFlash = false
  private lastPot = -1
  private lastHp = -1
  private victoryT = 0
  private hotbarKey = ''
  private lastHeld = ''
  private lastHFrac = 1
  private stampT = 0
  private whiteT = 0
  private jnoteT = 0
  private gadgetKey = ''
  private mealKey = ''
  /** Active sear gauge (cook tab). */
  private sear: { id: MealId; t: number; done: boolean } | null = null
  private searClock = 0
  private journalSel: SpeciesId = 'tuskhog'

  constructor(private readonly save: SaveStore, private readonly actions: UiActions) {
    this.root = document.querySelector('#ui')!
    this.root.innerHTML = this.template()
    for (const n of this.root.querySelectorAll<HTMLElement>('[data-el]')) this.el[n.dataset.el!] = n
    this.fx = new UiFx(document.body)
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    window.addEventListener('keydown', e => this.onKey(e))
    this.refreshSettings()
  }

  // ─── Templates ───────────────────────────────────────────────────────────

  private template(): string {
    return `
<section class="screen boot" data-el="boot">
  <div class="boot-bg"></div>
  <div class="boot-embers"></div>
  <div class="logo small">${LOGO}</div>
  <img class="boot-icon" data-game-asset="share/favicon.png" alt=""><div class="bar"><i data-el="bootBar"></i></div>
  <p class="muted" data-el="bootText" role="status" aria-live="polite">島を形作っています…</p>
  <button class="btn primary" data-el="bootRetry" style="display:none">再試行</button>
</section>

<section class="screen title" data-el="title">
  <div class="title-card">
    <div class="logo">${LOGO}</div>
    <p class="tagline">シンダーフォール島の獣を狩り、素材を剥ぎ取り、道具を作り、狼煙を上げよう。</p>
    <div class="menu-col">
      <button class="btn primary" data-act="continue" data-el="btnContinue">探索を続ける</button>
      <button class="btn" data-act="new" data-el="btnNew">新たな探索</button>
      <a class="btn ghost" href="./enemies/" data-el="btnLab">敵の研究室</a>
      <div class="row2">
        <button class="btn ghost" data-act="help">操作方法</button>
        <button class="btn ghost" data-act="settings">設定</button>
      </div>
    </div>
    <p class="fine">1人プレイ · 進行状況はこのブラウザーに保存されます</p>
  </div>
  <div class="confirm" data-el="confirmNew" hidden>
    <div class="panel narrow">
      <h3>最初から始めますか？</h3>
      <p>現在の探索状況は上書きされます。</p>
      <div class="row2"><button class="btn primary" data-act="confirm-new">新しく始める</button><button class="btn ghost" data-act="cancel-new">戻る</button></div>
    </div>
  </div>
</section>

<section class="screen hud" data-el="hud">
  <div class="vignette hurt" data-el="vHurt"></div>
  <div class="vignette heat" data-el="vHeat"></div>
  <div class="vignette low" data-el="vLow"></div>
  <div class="vitals">
    <img class="med heart" data-el="medHeart" src="./ui/med-heart.webp" alt="" draggable="false">
    <img class="med stam" data-el="medStam" src="./ui/med-stamina.webp" alt="" draggable="false">
    <div class="hpbar" data-el="hpBar"><i class="lost" data-el="hpLost"></i><i class="fill" data-el="hpFill"></i><b class="shine"></b><span data-el="hpText"></span></div>
    <div class="stbar" data-el="stBar"><i class="fill" data-el="stFill"></i><b class="shine"></b></div>
    <div class="vitals-row">
      <div class="chip slot" data-el="potChip" title="癒やし草の薬（R）"><img class="pi" src="./ui/icons/poultice.webp" width="26" height="26" alt=""><b data-el="potN">0</b><kbd>R</kbd></div>
      <div class="chip meal" data-el="mealChip" hidden title="食事効果"><i class="mring" data-el="mealRing"></i><img data-el="mealImg" src="./ui/icons/heartyHaunch.webp" width="28" height="28" alt=""><b data-el="mealT"></b><small data-el="mealName"></small></div>
          <div class="chip heatchip" data-el="heatChip" hidden>猛暑 — 耐熱装備を探そう</div>
    </div>
  </div>
  <div class="compass" data-el="compass"><img class="ring" data-el="compassRing" src="./ui/compass-ring.webp" alt="" draggable="false"><i class="needle" data-el="needle"></i><i class="needle2" data-el="needle2"></i><span data-el="compassDist"></span></div>
  <div class="bossbar" data-el="boss" hidden>
    <img class="crest" src="./ui/crest-boss.webp" alt="" draggable="false">
    <div class="bname"><b data-el="bossName"></b><span data-el="bossTitle"></span><em class="tag" data-el="bossTag"></em></div>
    <div class="bbar"><i class="lost" data-el="bossLost"></i><i class="fill" data-el="bossFill"></i></div>
  </div>
  <div class="target" data-el="target" hidden>
    <b data-el="tName"></b><em class="tag" data-el="tTag"></em>
    <div class="tbar"><i class="fill" data-el="tFill"></i></div>
  </div>
  <div class="objective" data-el="obj">
    <div class="obj-step" data-el="objStep"></div>
    <div class="obj-title" data-el="objTitle"></div>
    <div class="obj-detail" data-el="objDetail"></div>
    <div class="obj-dist" data-el="objDist"></div>
  </div>
  <div class="marker" data-el="marker"><i></i><span data-el="markerDist"></span></div>
  <div class="tmarker" data-el="tmarker"><img src="./ui/icons/tracked.webp" alt="" draggable="false"><span data-el="tmarkerDist"></span></div>
  <div class="reticle" data-el="reticle" hidden><img src="./ui/reticle.webp" alt="" draggable="false"></div>
  <div class="feed" data-el="feed"></div>
  <div class="popups" data-el="popups"></div>
  <div class="banner" data-el="banner"><small data-el="bannerKind"></small><h2 data-el="bannerTitle"></h2><p data-el="bannerSub"></p></div>
  <div class="tip" data-el="tip"></div>
  <div class="toast" data-el="toast"></div>
  <div class="hotbar" data-el="hotbar"></div>
  <div class="gadget" data-el="gadget" title="道具（Gで使用、Cで切替）"><img data-el="gadgetImg" src="./ui/icons/snare.webp" width="40" height="40" alt="" draggable="false"><b data-el="gadgetN">0</b><kbd>G</kbd><small data-el="gadgetName"></small><em><kbd>C</kbd> 切替</em></div>
  <div class="stamp" data-el="stamp"></div>
  <div class="whiteout" data-el="whiteout"></div>
  <div class="jnote" data-el="jnote"><img src="./ui/icons/journal.webp" alt="" draggable="false"><div><small>狩猟日誌</small><span data-el="jnoteText"></span></div></div>
  <div class="hbar" data-el="hbar"><b data-el="hbarName"></b><div class="hbar-track"><i class="lost" data-el="hbarLost"></i><i class="fill" data-el="hbarFill"></i></div><small data-el="hbarNote"></small></div>
  <div class="prompt" data-el="prompt"><kbd>E</kbd><span data-el="promptVerb"></span><small data-el="promptLabel"></small></div>
  <div class="clicklook" data-el="clickLook">クリックして視点操作</div>
  <div class="hints"><kbd>H</kbd> 操作方法 <kbd>Tab</kbd> ポーチ <kbd>M</kbd> 地図 <kbd>B</kbd> 日誌<i class="jdot" data-el="jdot"></i></div>
  <div class="region" data-el="region"></div>
</section>

<section class="screen menu" data-el="menu">
  <div class="panel wide">
    <header class="tabs">
      <button data-tab="materials">素材</button>
      <button data-tab="craft">作成</button>
      <button data-tab="cook">料理</button>
      <button data-tab="camp">キャンプ</button>
      <button data-tab="gear">装備</button>
      <button data-tab="journal">狩猟日誌</button>
      <span class="grow"></span>
      <span class="where" data-el="where"></span>
      <button class="x" data-act="close-menu" aria-label="閉じる">✕</button>
    </header>
    <div class="menu-body" data-el="menuBody"></div>
    <footer class="menu-foot" data-el="menuFoot"></footer>
  </div>
</section>

<section class="screen pause" data-el="pause">
  <div class="panel narrow">
    <h2>一時停止中</h2>
    <div class="menu-col">
      <button class="btn primary" data-act="resume">再開</button>
      <button class="btn" data-act="help">操作方法</button>
      <button class="btn" data-act="settings">設定</button>
      <button class="btn ghost" data-act="quit">セーブしてタイトルへ</button>
    </div>
  </div>
</section>

<section class="screen faint" data-el="faint">
  <h2>力尽きた…</h2>
  <p>キャンプまで運ばれました。ポーチの中身は失われていません。</p>
</section>

<section class="screen victory" data-el="victory">
  <div class="panel narrow center">
    <small class="eyebrow">探索完了</small>
    <h2>狼煙が上がった</h2>
    <p>シンダーフォール島に狼煙が上がりました。救助が向かっています。</p>
    <div class="stats" data-el="stats"></div>
    <div class="menu-col">
      <button class="btn primary" data-act="keep">探索を続ける</button>
      <button class="btn" data-act="new-after">新たな探索</button>
      <button class="btn ghost" data-act="quit">タイトルへ戻る</button>
    </div>
  </div>
</section>

<div class="overlay help" data-el="help" hidden>
  <div class="panel">
    <header><h3>操作方法</h3><button class="x" data-act="help" aria-label="閉じる">✕</button></header>
    <div class="help-grid">
      <dl>${CONTROLS.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join('')}</dl>
      <div class="help-tips"><h4>狩猟の心得</h4><ul>${TIPS.map(t => `<li>${t}</li>`).join('')}</ul></div>
    </div>
  </div>
</div>

<div class="overlay map" data-el="map" hidden>
  <div class="panel">
    <header><h3>シンダーフォール島</h3><button class="x" data-act="map" aria-label="閉じる">✕</button></header>
    <canvas data-el="mapCanvas" width="560" height="560"></canvas>
    <p class="legend"><i class="lg you"></i>自分 <i class="lg camp"></i>キャンプ <i class="lg obj"></i>目標 <i class="lg boss"></i>頂点捕食者 <i class="lg trk"></i>追跡中の獣</p>
  </div>
</div>

<div class="overlay settings" data-el="settings" hidden>
  <div class="panel narrow">
    <header><h3>設定</h3><button class="x" data-act="settings-close" aria-label="閉じる">✕</button></header>
    <label>音楽 <input type="range" min="0" max="1" step="0.05" data-set="musicVolume"></label>
    <label>効果音 <input type="range" min="0" max="1" step="0.05" data-set="sfxVolume"></label>
    <label>マウス感度 <input type="range" min="0.3" max="2.5" step="0.05" data-set="sensitivity"></label>
    <label class="check"><input type="checkbox" data-set="invertY"> Y軸を反転</label>
    <label class="check"><input type="checkbox" data-set="reducedMotion"> 画面の揺れを軽減</label>
    <label class="check"><input type="checkbox" data-set="muted"> すべての音を消す</label>
    <label>画質
      <select data-set="quality"><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select>
    </label>
    <p class="fine">画質の変更はページを再読み込みすると反映されます。</p>
  </div>
</div>`
  }

  // ─── Screens ─────────────────────────────────────────────────────────────

  show(s: Screen): void {
    this.screen = s
    for (const k of ['boot', 'title', 'hud', 'menu', 'pause', 'faint', 'victory']) this.el[k].classList.toggle('on', k === s || (k === 'hud' && (s === 'menu' || s === 'faint')))
    if (s === 'title') {
      const has = !!this.game?.hasSave
      this.el.btnContinue.hidden = !has
      this.el.btnNew.classList.toggle('primary', !has)
    }
    if (s !== 'hud') {
      this.setMap(false)
    }
  }

  setBootProgress(f: number, text?: string): void {
    this.el.bootBar.style.width = `${Math.round(f * 100)}%`
    if (text) this.el.bootText.textContent = text
  }

  showBootError(): void {
    this.show('boot')
    this.el.bootText.textContent = '起動に失敗しました。接続を確認して再試行してください。'
    this.el.bootRetry.style.display = 'inline-flex'
    this.el.bootRetry.onclick = () => location.reload()
  }

  refreshSettings(): void {
    const d = this.save.data
    for (const inp of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-set]')) {
      const key = inp.dataset.set as keyof SaveData
      const v = d[key]
      if (inp instanceof HTMLInputElement && inp.type === 'checkbox') inp.checked = !!v
      else inp.value = String(v)
    }
  }

  private toggleHelp(on = !this.helpOpen): void {
    this.helpOpen = on
    this.el.help.hidden = !on
  }

  private setMap(on: boolean): void {
    this.mapOpen = on
    this.el.map.hidden = !on
  }

  // ─── Input ───────────────────────────────────────────────────────────────

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement
    const tabBtn = t.closest<HTMLElement>('[data-tab]')
    if (tabBtn) {
      this.game?.audio.play('ui')
      this.renderMenu(tabBtn.dataset.tab as MenuTab)
      return
    }
    const b = t.closest<HTMLElement>('[data-act]')
    if (!b) return
    const act = b.dataset.act!
    const g = this.game
    g?.audio.unlock()
    switch (act) {
      case 'continue':
        this.actions.continueGame()
        break
      case 'new':
        if (g?.hasSave) this.el.confirmNew.hidden = false
        else this.actions.newGame()
        break
      case 'confirm-new':
        this.el.confirmNew.hidden = true
        this.actions.newGame()
        break
      case 'cancel-new':
        this.el.confirmNew.hidden = true
        break
      case 'new-after':
        this.actions.newGame()
        break
      case 'help':
        this.toggleHelp()
        break
      case 'map':
        this.setMap(false)
        break
      case 'settings':
        this.refreshSettings()
        this.el.settings.hidden = false
        break
      case 'settings-close':
        this.el.settings.hidden = true
        break
      case 'resume':
        this.actions.resume()
        break
      case 'quit':
        this.actions.quitToTitle()
        break
      case 'keep':
        this.actions.keepExploring()
        break
      case 'close-menu':
        this.closeMenu()
        break
      case 'craft':
        if (g) {
          const r = g.craft(b.dataset.id as RecipeDef['id'])
          this.toast(r.ok ? r.message : r.reason, r.ok ? 'good' : 'warn')
          if (r.ok) {
            const card = b.closest('.recipe') ?? b
            const [x, y] = this.fx.at(card, 0.08, 0.5)
            this.fx.burst(x, y, { color: ['#ffd27a', '#ff9a3a', '#fff2c8'], n: 40, speed: 360, kind: 'star', grav: 200, life: 0.9 })
            this.fx.ring(x, y, '#ffd27a', 80, 0.5)
            this.fx.outline(card, { color: ['#ffd27a', '#fff2c8'], n: 40, speed: 60, grav: -30, life: 0.9 })
          }
          this.renderMenu(this.tab)
        }
        break
      case 'cook':
        if (g) this.startSear(b.dataset.id as MealId)
        break
      case 'sear-stop':
        this.stopSear()
        break
      case 'jsel':
        this.journalSel = b.dataset.id as SpeciesId
        g?.audio.play('page')
        this.renderMenu('journal')
        break
      case 'equip':
        g?.equip(b.dataset.id as GearId)
        this.renderMenu(this.tab)
        break
      case 'upgrade':
        if (g) {
          const r = g.upgrade()
          if (r.ok) {
            for (let i = 0; i < 5; i += 1) setTimeout(() => this.fx.burst(innerWidth * (0.3 + Math.random() * 0.4), innerHeight * (0.35 + Math.random() * 0.3), { color: ['#ffd27a', '#ff9a3a', '#fff2c8', '#9dff9a'], n: 36, speed: 420, kind: 'star', grav: 260, life: 1.1 }), i * 140)
            this.closeMenu()
          }
          else this.toast(r.reason, 'warn')
          if (!r.ok) this.renderMenu('camp')
        }
        break
      case 'tower':
        if (g) {
          const r = g.restoreTower()
          if (r.ok) this.show('hud')
          else {
            this.toast(r.reason, 'warn')
            this.renderMenu('camp')
          }
        }
        break
    }
  }

  private onInput(e: Event): void {
    const inp = e.target as HTMLInputElement | HTMLSelectElement
    const key = inp.dataset.set as keyof SaveData | undefined
    if (!key) return
    let v: unknown
    if (inp instanceof HTMLInputElement && inp.type === 'checkbox') v = inp.checked
    else if (inp instanceof HTMLInputElement && inp.type === 'range') v = Number(inp.value)
    else v = inp.value
    this.actions.settings({ [key]: v } as Partial<SaveData>)
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return
    if (!this.el.settings.hidden && e.code === 'Escape') {
      this.el.settings.hidden = true
      this.actions.consumeKeys()
      return
    }
    if (this.helpOpen && (e.code === 'Escape' || e.code === 'KeyH')) {
      this.toggleHelp(false)
      this.actions.consumeKeys()
      return
    }
    if (this.screen === 'menu' && this.sear && !this.sear.done && (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault()
      this.stopSear()
      this.actions.consumeKeys()
      return
    }
    if (this.screen === 'menu' && this.tab === 'journal' && e.code === 'KeyB') {
      this.closeMenu()
      this.actions.consumeKeys()
      return
    }
    if (this.screen === 'menu' && (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI')) {
      e.preventDefault()
      this.closeMenu()
      this.actions.consumeKeys()
      return
    }
    if (this.screen === 'menu') {
      const m = /^Digit([1-6])$/.exec(e.code)
      if (m && !this.sear) this.renderMenu(TABS[Number(m[1]) - 1])
      return
    }
    if (this.screen === 'hud' && this.game?.mode === 'playing') {
      if (e.code === 'KeyM') this.setMap(!this.mapOpen)
      if (e.code === 'KeyH') this.toggleHelp()
      if (e.code === 'Escape' && (this.mapOpen || this.helpOpen)) {
        this.setMap(false)
        this.toggleHelp(false)
        this.actions.consumeKeys()
      }
    } else if (this.screen === 'title' && e.code === 'KeyH') this.toggleHelp()
  }

  private closeMenu(): void {
    if (this.screen !== 'menu') return
    if (this.sear && !this.sear.done) this.stopSear()
    this.sear = null
    this.game?.resume()
    this.show('hud')
    this.actions.lockPointer()
  }

  // ─── Menu (satchel) ──────────────────────────────────────────────────────

  openMenu(tab: MenuTab = 'materials'): void {
    this.show('menu')
    this.renderMenu(tab)
  }

  private costChips(cost: Cost): string {
    const g = this.game!
    return `<div class="costs">${(Object.entries(cost) as [ItemId, number][])
      .map(([id, need]) => {
        const have = count(g.progress, id)
        const it = ITEMS[id]
        return `<span class="cost ${have >= need ? 'ok' : 'no'}" title="${esc(it.name)}">${itemIcon(id, 24)}<b>${Math.min(have, 99)}/${need}</b><small>${esc(it.name)}</small></span>`
      })
      .join('')}</div>`
  }

  renderMenu(tab: MenuTab): void {
    const g = this.game
    if (!g) return
    this.tab = tab
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab)
    const p = g.progress
    const atCamp = g.atCamp
    this.el.where.innerHTML = atCamp ? `<span class="ok">● キャンプにいる</span> · 段階 ${ROMAN[p.campStage]}` : `<span class="no">● 野外にいる</span> · クラフトにはキャンプのかまどが必要です`
    let html = ''
    if (tab === 'materials') {
      const ids = (Object.keys(ITEMS) as ItemId[]).filter(id => count(p, id) > 0)
      const groups: [string, ItemId[]][] = [
        ['素材', ids.filter(i => ITEMS[i].kind === 'material')],
        ['獣の素材', ids.filter(i => ITEMS[i].kind === 'part')],
        ['重要アイテム・消耗品', ids.filter(i => ITEMS[i].kind === 'key' || ITEMS[i].kind === 'consumable')],
      ]
      html = groups
        .map(([name, list]) => `<h4>${name}</h4>${list.length ? `<div class="items">${list.map(id => `<div class="item k-${ITEMS[id].kind}" title="${esc(ITEMS[id].desc)}">${itemIcon(id, 44)}<b>${count(p, id)}</b><span>${esc(ITEMS[id].name)}</span><small>${esc(ITEMS[id].desc)}</small></div>`).join('')}</div>` : '<p class="muted">まだ何もありません。</p>'}`)
        .join('')
      const hunts = Object.entries(p.hunts) as [keyof typeof SPECIES, number][]
      html += `<h4>狩猟記録</h4>${hunts.length ? `<div class="hunts">${hunts.map(([s, n]) => `<span><b>${n}×</b> ${esc(SPECIES[s].name)}</span>`).join('')}</div>` : '<p class="muted">狩猟記録はありません。</p>'}`
    } else if (tab === 'craft') {
      html = `<div class="recipes">${RECIPES.map(r => {
        const st = recipeState(p, r)
        const gear = r.gear ? GEAR[r.gear] : null
        const name = gear ? gear.name : ITEMS[r.item!].name
        const desc = gear ? gear.desc : ITEMS[r.item!].desc
        const wcls = gear?.slot === 'weapon' ? weaponClass(gear.id) : null
        const cls = wcls ? ` · <b class="cls c-${wcls}">${WEAPON_CLASSES[wcls].name}</b>` : ''
        const statLine = gear
          ? gear.slot === 'weapon'
            ? `攻撃力 <b>${gear.attack}</b>${cls}<br><small class="clsdesc">${esc(WEAPON_CLASSES[wcls!].desc)}</small>`
            : gear.slot === 'armor'
              ? `防御力 <b>${Math.round((gear.defense ?? 0) * 100)}%</b> · 体力 <b>+${gear.hp}</b>${gear.heatProof ? ' · <b class="hot">耐熱</b>' : ''}`
              : `道具`
          : r.item === 'poultice' ? `体力を<b>45</b>回復 · 最大5個` : `道具 · 最大<b>${r.item === 'flashPod' ? 5 : r.item === 'snare' ? 3 : 2}</b>個 · 所持数 <b>${count(p, r.item!)}</b>`
        const ic = gear ? `<span class="gi">${PAINTED_GEAR.has(gear.id) ? `<img class="pi" src="./ui/icons/${gear.id}.webp" width="40" height="40" alt="">` : gearIcon(gear.slot, gear.tier)}</span>` : `<span class="gi">${itemIcon(r.item!, 40)}</span>`
        const label = st === 'owned' ? '所持中' : st === 'full' ? 'いっぱい' : st === 'locked' ? `キャンプ ${ROMAN[r.stage]}` : '作成'
        const can = st === 'ready' && atCamp
        return `<div class="recipe s-${st}">${ic}<div class="rinfo"><b>${esc(name)}</b><small>${esc(desc)}</small><span class="stat">${statLine}</span>${st !== 'owned' ? this.costChips(r.cost) : ''}</div>
          <button class="btn sm ${can ? 'primary' : ''}" data-act="craft" data-id="${r.id}" ${can ? '' : 'disabled'}>${label}</button></div>`
      }).join('')}</div>`
    } else if (tab === 'camp') {
      const next = nextCampStage(p)
      const pips = [1, 2, 3].map(s => `<div class="pip ${p.campStage >= s ? 'done' : next?.stage === s ? 'next' : ''}"><b>${ROMAN[s]}</b><span>${esc(CAMP_STAGES[s - 1].name)}</span></div>`).join('<i class="pipline"></i>')
      html = `<div class="camp-stages">${pips}</div>`
      if (next) {
        const ok = missing(p, next.cost).length === 0
        html += `<div class="card"><h4>次の段階：${esc(next.name)} <small>（${ROMAN[next.stage]} / III）</small></h4><p>${esc(next.desc)}</p>${this.costChips(next.cost)}
          <button class="btn ${ok && atCamp ? 'primary' : ''}" data-act="upgrade" ${ok && atCamp ? '' : 'disabled'}>${atCamp ? (ok ? '建設する' : '素材不足') : 'キャンプに戻って建設'}</button></div>`
      } else html += `<div class="card"><h4>ストーンホールド完成</h4><p>キャンプが完成しました。</p></div>`
      const ts = towerState(p)
      html += `<div class="card tower"><h4>狼煙の塔</h4><p>${ts === 'done' ? '狼煙が上がりました。救助が向かっています。' : ts === 'locked' ? '建設にはストーンホールド（キャンプ段階III）が必要です。' : '頂点捕食者の戦利品と燃料を集め、狼煙の塔を建てて火を灯そう。探索はここで完了します。'}</p>
        ${ts !== 'done' ? this.costChips(TOWER_COST) : ''}
        ${ts === 'ready' || ts === 'missing' ? `<button class="btn ${ts === 'ready' && atCamp ? 'primary glow' : ''}" data-act="tower" ${ts === 'ready' && atCamp ? '' : 'disabled'}>${ts === 'ready' ? '狼煙の塔を修復する' : '素材不足'}</button>` : ''}</div>`
    } else if (tab === 'cook') {
      html = this.cookHtml(g)
    } else if (tab === 'journal') {
      html = this.journalHtml(g)
      this.el.jdot.classList.remove('on')
    } else {
      const s = gearStats(p)
      html = `<div class="statline"><span>攻撃力 <b>${s.attack}</b></span><span>防御力 <b>${Math.round(s.defense * 100)}%</b></span><span>最大体力 <b>${s.maxHp}</b></span><span>耐熱 <b class="${s.heatProof ? 'ok' : 'no'}">${s.heatProof ? '耐熱' : '無防備'}</b></span><span>剥ぎ取り <b>+${s.carves}</b></span><span>採掘 <b class="${s.canMine ? 'ok' : 'no'}">${s.canMine ? 'あり' : 'なし'}</b></span></div>`
      for (const slot of ['weapon', 'armor', 'tool'] as const) {
        const list = (Object.values(GEAR) as (typeof GEAR)[GearId][]).filter(gd => gd.slot === slot)
        html += `<h4>${slot === 'weapon' ? '武器' : slot === 'armor' ? '防具' : '道具'}</h4><div class="gear-list">${list
          .map(gd => {
            const own = p.owned.includes(gd.id)
            const on = p.weapon === gd.id || p.armor === gd.id
            const gi = PAINTED_GEAR.has(gd.id) ? `<img class="pi" src="./ui/icons/${gd.id}.webp" width="44" height="44" alt="">` : gearIcon(slot, gd.tier)
            const wc = slot === 'weapon' ? `<em class="cls c-${weaponClass(gd.id)}">${WEAPON_CLASSES[weaponClass(gd.id)].name} · ${gd.attack}</em>` : ''
            return `<div class="gearcard ${own ? '' : 'missing'} ${on ? 'on' : ''}">${gi}<b>${esc(gd.name)}</b>${wc}<small>${own ? esc(gd.desc) : '未作成'}</small>${own && slot !== 'tool' ? `<button class="btn sm" data-act="equip" data-id="${gd.id}" ${on ? 'disabled' : ''}>${on ? '装備中' : '装備する'}</button>` : own ? `<em class="okc">${gd.id === 'flintHatchet' ? '<kbd>2</kbd>で手に持つ' : gd.id === 'flintPick' ? '<kbd>3</kbd>で手に持つ · 鉱脈を採掘' : '常時有効'}</em>` : ''}</div>`
          })
          .join('')}</div>`
      }
    }
    this.el.menuBody.innerHTML = html
    this.el.menuFoot.innerHTML = `<span><kbd>1</kbd>–<kbd>6</kbd> タブ</span><span><kbd>Tab</kbd>/<kbd>Esc</kbd> 閉じる</span>`
  }

  private cookHtml(g: Game): string {
    const p = g.progress
    const atCamp = g.atCamp
    let html = ''
    if (p.meal) {
      const m = MEALS[p.meal.id]
      html += `<div class="card meal-now"><img class="pi" src="./ui/icons/${m.id}.webp" width="56" height="56" alt=""><div><h4>食事済み：${esc(m.name)} <small class="q-${p.meal.q}">${p.meal.q === 'perfect' ? '絶妙な焼き加減' : p.meal.q === 'charred' ? '焦げた' : 'よく焼けた'}</small></h4><p>${esc(m.desc)} · <b>${fmtTime(p.meal.t)}</b> 残り。再調理すると効果が上書きされます。</p></div></div>`
    } else html += `<p class="muted cook-intro">狩りの前に料理を食べましょう。効果は約5分続き、力尽きると終了します。焼き加減を<b class="gold">金色の範囲</b>で止めると効果が50%長持ちします。</p>`
    if (this.sear) {
      const m = MEALS[this.sear.id]
      const [g0, g1] = SEAR_ZONES.good
      const [p0, p1] = SEAR_ZONES.perfect
      html += `<div class="sear ${this.sear.done ? 'done' : ''}" data-el-sear><h4>調理中：${esc(m.name)}…</h4>
        <div class="sgauge"><i class="zg" style="left:${g0 * 100}%;width:${(g1 - g0) * 100}%"></i><i class="zp" style="left:${p0 * 100}%;width:${(p1 - p0) * 100}%"></i><b class="sneedle" data-sneedle></b></div>
        <p>${this.sear.done ? '' : '<kbd>Space</kbd>または<kbd>E</kbd>（またはクリック）で火から下ろす'}</p>
        ${this.sear.done ? '' : '<button class="btn primary" data-act="sear-stop">火から下ろす</button>'}</div>`
    }
    html += `<div class="recipes meals">${MEAL_ORDER.map(id => {
      const m = MEALS[id]
      const st = cookState(p, id)
      const can = st === 'ready' && atCamp && !this.sear
      const label = st === 'locked' ? `キャンプ ${ROMAN[m.stage]}` : !atCamp ? 'かまどで調理' : st === 'missing' ? '不足' : '料理する'
      return `<div class="recipe s-${st}"><span class="gi"><img class="pi" src="./ui/icons/${id}.webp" width="44" height="44" alt=""></span><div class="rinfo"><b>${esc(m.name)}</b><span class="stat buff">${esc(m.desc)}</span>${this.costChips(m.cost)}</div>
        <button class="btn sm ${can ? 'primary' : ''}" data-act="cook" data-id="${id}" ${can ? '' : 'disabled'}>${label}</button></div>`
    }).join('')}</div>`
    return html
  }

  private startSear(id: MealId): void {
    const g = this.game
    if (!g || this.sear) return
    if (cookState(g.progress, id) !== 'ready' || !g.atCamp) return
    this.sear = { id, t: 0, done: false }
    this.searClock = 0
    g.audio.play('sizzle')
    this.renderMenu('cook')
  }

  /** Where the sear needle is (0..1): sweeps up then back down once, then burns. */
  private searPos(t: number): number {
    const T = 1.25
    return t < T ? t / T : Math.max(0, 1 - (t - T) / T)
  }

  private stopSear(): void {
    const g = this.game
    const sr = this.sear
    if (!g || !sr || sr.done) return
    sr.done = true
    const x = this.searPos(sr.t)
    const burnt = sr.t >= 2.5
    const q: SearQuality = burnt ? 'charred' : x >= SEAR_ZONES.perfect[0] && x <= SEAR_ZONES.perfect[1] ? 'perfect' : x >= SEAR_ZONES.good[0] && x <= SEAR_ZONES.good[1] ? 'good' : 'charred'
    const r = g.cookMeal(sr.id, q)
    const gauge = this.root.querySelector<HTMLElement>('.sgauge')
    if (r.ok) {
      this.toast(r.message, 'good')
      const [cx, cy] = gauge ? this.fx.at(gauge, x, 0.5) : [innerWidth / 2, innerHeight / 2]
      if (q === 'perfect') {
        this.stamp('絶妙な焼き加減', 'gold')
        this.fx.burst(cx, cy, { color: ['#ffd27a', '#fff2c8', '#ff9a3a'], n: 70, speed: 460, kind: 'star', grav: 220, life: 1.2, size: 10 })
        this.fx.ring(cx, cy, '#ffd27a', 120, 0.6)
      } else if (q === 'good') {
        this.fx.burst(cx, cy, { color: ['#ffcf7a', '#fff2c8'], n: 34, speed: 300, kind: 'star', grav: 200 })
      } else {
        this.fx.burst(cx, cy, { color: ['#4a3a30', '#8a6a50', '#2a2220'], n: 30, speed: 180, kind: 'dot', grav: -60, life: 1.2 })
        this.toast(`焦げた! ${r.message} (shorter buff)`, 'warn')
      }
      const meal = this.el.mealChip
      window.setTimeout(() => {
        if (meal.hidden) return
        const [mx, my] = this.fx.at(meal)
        this.fx.fly(`<img class="pi" src="./ui/icons/${sr.id}.webp" width="40" height="40" alt="">`, [cx, cy], meal, '#ffd27a')
        this.fx.ring(mx, my, '#ffd27a', 50, 0.5)
      }, 60)
    } else this.toast(r.reason, 'warn')
    window.setTimeout(() => {
      this.sear = null
      if (this.screen === 'menu' && this.tab === 'cook') this.renderMenu('cook')
    }, 900)
    this.renderMenu('cook')
  }

  private journalHtml(g: Game): string {
    const p = g.progress
    const ids = Object.keys(SPECIES) as SpeciesId[]
    const list = ids.map(sp => {
      const k = knowledge(p, sp)
      const d = SPECIES[sp]
      return `<button class="jcard ${sp === this.journalSel ? 'on' : ''} ${k.seen ? '' : 'unknown'} ${d.boss ? 'boss' : ''}" data-act="jsel" data-id="${sp}">
        <b>${k.seen ? esc(d.name) : '???'}</b><small>${k.seen ? esc(REGION_NAMES[d.region]) : '未発見'}</small>
        <span class="jbadges">${k.tracked ? '<i class="jb trk" title="追跡中"></i>' : ''}${k.weak ? '<i class="jb wk" title="弱点判明"></i>' : ''}${k.hunted ? `<i class="jb hn">${k.hunts}</i>` : ''}</span></button>`
    }).join('')
    const sp = this.journalSel
    const d = SPECIES[sp]
    const k = knowledge(p, sp)
    let page = ''
    if (!k.seen) {
      page = `<div class="jpage unknown"><h3>未知の獣</h3><p>${esc(REGION_NAMES[d.region])}に生息すると噂されています。姿を見つけると記録が始まります。</p></div>`
    } else {
      const pips = Array.from({ length: TRACKING.cluesNeeded }, (_, i) => `<i class="pip ${i < k.clues ? 'on' : ''}"></i>`).join('')
      const zone = d.weak.zone
      const diagram = `<svg class="wzone" viewBox="-50 -50 100 100" width="92" height="92"><circle r="40" fill="rgba(0,0,0,.18)" stroke="#6b5236" stroke-width="2"/>${k.weak ? `<path d="${zone === 'head' ? 'M0 0 L-17 -37 A40 40 0 0 1 17 -37 Z' : zone === 'rear' ? 'M0 0 L-17 37 A40 40 0 0 0 17 37 Z' : 'M0 0 L-37 -17 A40 40 0 0 0 -37 17 Z M0 0 L37 -17 A40 40 0 0 1 37 17 Z'}" fill="#ff8a2a" opacity=".85"/>` : ''}<ellipse rx="11" ry="20" fill="#d9c49c" stroke="#3b2a1a" stroke-width="2"/><circle cy="-22" r="7" fill="#d9c49c" stroke="#3b2a1a" stroke-width="2"/><text y="-44" text-anchor="middle" font-size="9" fill="#6b5236">前</text></svg>`
      const preds = ids.filter(o => SPECIES[o].prey?.includes(sp))
      const eco = (k.tracked || k.hunted)
        ? `<p><b>生息地：</b> ${esc(d.habitat)}</p>${d.prey?.length ? `<p><b>捕食対象：</b> ${d.prey.map(x => esc(SPECIES[x].name)).join(', ')}。食事中に奇襲しましょう。</p>` : ''}${preds.length ? `<p><b>天敵：</b> ${preds.map(x => esc(SPECIES[x].name)).join(', ')}</p>` : ''}`
        : `<p class="muted">${TRACKING.cluesNeeded}個の手がかり（足跡、フン、爪痕）を調べると、生息地や生態がわかります。</p>`
      const atks = k.hunted
        ? `<ul class="jatk">${d.attacks.map(a => `<li><b>${esc(a.name)}</b> <small>${esc(a.desc)}</small></li>`).join('')}</ul>`
        : `<p class="muted">狩猟すると攻撃方法が記録されます。</p>`
      let drops: string
      if (d.bossCarves) {
        const all = new Set<ItemId>()
        for (const c of d.bossCarves) for (const id of Object.keys(c) as ItemId[]) all.add(id)
        drops = `<div class="jdrops">${[...all].map(id => k.parts.includes(id) || k.exact ? `<span>${itemIcon(id, 28)}${esc(ITEMS[id].name)}</span>` : '<span class="q">?</span>').join('')}</div>`
      } else {
        const total = d.drops.reduce((a, x) => a + x.weight, 0)
        drops = `<div class="jdrops">${d.drops.map(x => k.parts.includes(x.item) || k.exact ? `<span>${itemIcon(x.item, 28)}${esc(ITEMS[x.item].name)}${k.exact ? `<b>${Math.round((x.weight / total) * 100)}%</b>` : ''}</span>` : '<span class="q">?</span>').join('')}</div>${k.exact ? '' : `<p class="muted fine">あと${Math.max(0, 3 - k.hunts)}回狩ると剥ぎ取り確率が判明します。</p>`}`
      }
      page = `<div class="jpage"><header><h3>${esc(d.name)}</h3><small>${esc(d.title)}</small>${k.tracked ? '<em class="tag trk">追跡中</em>' : ''}</header>
        <p class="lore">${esc(d.lore)}</p>
        <div class="jgrid"><div><h5>弱点</h5>${diagram}<p>${k.weak ? `<b>${esc(d.weak.label)}</b>に与えるダメージ ×${d.weak.mult}` : '<span class="muted">攻撃して弱点を見つけよう</span>'}</p></div>
        <div><h5>追跡</h5><div class="pips">${pips}</div><p>${k.clues}/${TRACKING.cluesNeeded}個の手がかり${k.tracked ? ' · 追跡中' : ''}</p><h5>記録</h5><p>討伐数 <b>${k.hunts}</b>${k.best ? ` · 最速 <b>${fmtTime(k.best)}</b>` : ''}</p></div></div>
        <h5>生態</h5>${eco}<h5>攻撃</h5>${atks}<h5>剥ぎ取り</h5>${drops}</div>`
    }
    return `<div class="journal"><div class="jlist">${list}</div>${page}</div>`
  }

  // ─── Hooks for the game ──────────────────────────────────────────────────

  hooks(): Hooks {
    return {
      popup: (text, at, kind) => this.popup(text, at, kind),
      toast: (text, kind) => this.toast(text, kind),
      loot: (id, n) => this.loot(id, n),
      banner: (title, sub, kind) => this.banner(title, sub, kind),
      tip: (_id, html) => this.tip(html),
      openMenu: tab => this.openMenu(tab ?? 'materials'),
      faint: () => this.show('faint'),
      victory: () => this.showVictory(),
      stamp: (text, kind) => this.stamp(text, kind),
      journal: (_sp, text) => this.journalなしte(text),
      flash: a => {
        this.whiteT = Math.max(this.whiteT, Math.min(1, a))
      },
      hurt: amount => {
        this.hurtT = Math.min(1, 0.35 + amount / 40)
        const [x, y] = this.fx.at(this.el.hpFill, 1, 0.5)
        this.fx.burst(x, y, { color: ['#ff4a3a', '#ff9a6a', '#ffd0b0'], n: 10 + Math.min(20, Math.round(amount)), speed: 260, kind: 'shard', grav: 520, life: 0.7, dir: -Math.PI / 2, spread: 2.6 })
        this.el.medHeart.classList.remove('thump'); void this.el.medHeart.offsetWidth; this.el.medHeart.classList.add('thump')
      },
    }
  }

  popup(text: string, at: THREE.Vector3, kind: PopupKind): void {
    const el = document.createElement('div')
    el.className = `pop p-${kind}`
    el.textContent = text
    this.el.popups.appendChild(el)
    const jitter = kind === 'dmg' || kind === 'punish' || kind === 'big' ? (Math.random() - 0.5) * 0.8 : 0
    this.popups.push({ el, pos: at.clone().add(new THREE.Vector3(jitter, 0, jitter)), t: 0, life: kind === 'loot' ? 1.6 : kind === 'info' || kind === 'big' ? 1.3 : 0.9 })
    const g = this.game
    if (g && (kind === 'punish' || kind === 'big' || kind === 'loot' || kind === 'info')) {
      const sp = g.project(at)
      if (!sp.behind) {
        if (kind === 'loot' && this.lastLootId) {
          const id = this.lastLootId
          const target = this.el.feed.firstElementChild ?? this.el.feed
          this.fx.fly(itemIcon(id, 40), [sp.x, sp.y], target, ITEMS[id].kind === 'part' ? '#ffb45a' : '#ffe08a')
        } else if (kind === 'info') this.fx.burst(sp.x, sp.y, { color: ['#9fe8ff', '#e6fbff'], n: 16, speed: 220, kind: 'star' })
        else this.fx.burst(sp.x, sp.y, { color: kind === 'punish' ? ['#ffb347', '#ffe08a', '#fff'] : ['#ffe08a', '#fff2c8'], n: kind === 'punish' ? 26 : 16, speed: kind === 'punish' ? 320 : 240, kind: 'star', grav: 120 })
      }
    }
    if (this.popups.length > 40) this.popups.shift()!.el.remove()
  }

  stamp(text: string, kind: StampKind): void {
    const el = this.el.stamp
    el.textContent = text
    el.className = `stamp s-${kind}`
    void el.offsetWidth
    el.classList.add('on')
    this.stampT = 1.5
    const col: Record<StampKind, string[]> = {
      gold: ['#ffd27a', '#fff2c8', '#ff9a3a'], trap: ['#b8f07a', '#f2ffd0', '#6ac04a'], flash: ['#ffffff', '#fff6c8', '#bfe8ff'],
      track: ['#d6ff8a', '#9ae8ff', '#ffffff'], counter: ['#ffe9a8', '#ffb347', '#ffffff'],
    }
    requestAnimationFrame(() => {
      const [x, y] = this.fx.at(el)
      this.fx.burst(x, y, { color: col[kind], n: 44, speed: 420, kind: 'star', grav: 160, life: 1, size: 10 })
      this.fx.ring(x, y, col[kind][0], 140, 0.5)
    })
  }

  private journalなしte(text: string): void {
    const el = this.el.jnote
    this.el.jnoteText.textContent = text
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
    this.jnoteT = 3.4
    this.game?.audio.play('page', 0.8)
    this.el.jdot.classList.add('on')
    requestAnimationFrame(() => {
      const [x, y] = this.fx.at(el, 0.1, 0.5)
      this.fx.burst(x, y, { color: ['#f2e2b8', '#ffd27a', '#fff'], n: 20, speed: 180, kind: 'star', grav: 40, life: 0.8 })
    })
  }

  toast(text: string, kind: 'good' | 'warn' | 'info' = 'info'): void {
    const t = this.el.toast
    t.textContent = text
    t.className = `toast on t-${kind}`
    this.toastT = 3
  }

  loot(id: ItemId, n: number): void {
    this.lastLootId = id
    const existing = this.feed.find(f => f.id === id && f.t < 2.5)
    if (existing) {
      existing.n += n
      existing.t = 0
      existing.el.querySelector('b')!.textContent = `+${existing.n}`
      existing.el.classList.remove('bump')
      void existing.el.offsetWidth
      existing.el.classList.add('bump')
      return
    }
    const it = ITEMS[id]
    const el = document.createElement('div')
    el.className = `fi k-${it.kind} bump`
    el.innerHTML = `${itemIcon(id, 28)}<b>+${n}</b><span>${esc(it.name)}</span><small>${count(this.game!.progress, id)}</small>`
    this.el.feed.prepend(el)
    this.feed.push({ id, n, t: 0, el })
    while (this.feed.length > 6) this.feed.shift()!.el.remove()
  }

  banner(title: string, sub: string, kind: 'region' | 'boss' | 'camp' = 'region'): void {
    this.el.bannerKind.textContent = kind === 'boss' ? '頂点捕食者' : kind === 'camp' ? 'キャンプ' : 'エリア到達'
    this.el.bannerTitle.textContent = title
    this.el.bannerSub.textContent = sub
    this.el.banner.className = `banner on b-${kind}`
    requestAnimationFrame(() => this.fx.outline(this.el.banner, { color: kind === 'boss' ? ['#ff6a3a', '#ffb45a'] : ['#ffd27a', '#fff2c8'], n: 46, speed: 90, grav: -40, life: 1.1, size: 9 }))
    this.bannerT = kind === 'boss' ? 4 : 3.6
  }

  tip(html: string): void {
    this.el.tip.innerHTML = `<small>野外メモ</small>${html}`
    this.el.tip.classList.add('on')
    this.tipT = 10
  }

  showVictory(): void {
    const p = this.game!.progress
    const hunts = Object.values(p.hunts).reduce((a, b) => a + (b ?? 0), 0)
    this.el.stats.innerHTML = [
      ['島での滞在時間', fmtTime(p.playTime)],
      ['討伐した獣', String(hunts)],
      ['頂点捕食者', `${Number(p.bosses.ruinhorn) + Number(p.bosses.vulkarr)} / 2`],
      ['作成したアイテム', String(p.crafted)],
      ['力尽きた回数', String(p.faints)],
      ['探索した地域', `${p.regions.length} / 3`],
    ]
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join('')
    this.show('victory')
  }

  // ─── Per-frame HUD ───────────────────────────────────────────────────────

  /** Held-item hotbar: weapon / hatchet / pick / fists. Rebuilt only when its contents change. */
  private updateHotbar(g: Game): void {
    const p = g.progress
    const w = GEAR[p.weapon]
    const sling = weaponClass(p.weapon) === 'sling'
    const key = `${p.held}|${p.weapon}|${p.owned.includes('flintHatchet')}|${p.owned.includes('flintPick')}|${sling ? count(p, 'stone') : ''}`
    const E = this.el
    if (key !== this.hotbarKey) {
      this.hotbarKey = key
      const slot = (id: string, n: number, img: string, name: string, own: boolean) =>
        `<div class="hslot ${p.held === id ? 'on' : ''} ${own ? '' : 'locked'}" data-slot="${id}" title="${esc(name)}"><img src="${img}" alt="" draggable="false" width="44" height="44"><kbd>${n}</kbd><small>${esc(own ? name : 'キャンプで作成')}</small></div>`
      E.hotbar.innerHTML =
        slot('weapon', 1, PAINTED_GEAR.has(w.id) ? `./ui/icons/${w.id}.webp` : './ui/icons/gear-weapon.webp', w.name, true).replace('</div>', sling ? `<b class="ammo ${count(p, 'stone') ? '' : 'empty'}">${count(p, 'stone')}</b></div>` : '</div>') +
        slot('flintHatchet', 2, './ui/icons/flintHatchet.webp', 'Flint Hatchet', p.owned.includes('flintHatchet')) +
        slot('flintPick', 3, './ui/icons/flintPick.webp', 'Flint Pick', p.owned.includes('flintPick')) +
        slot('hands', 4, './ui/icons/hands.webp', 'Bare Hands', true)
      if (this.lastHeld && this.lastHeld !== p.held) {
        const el = E.hotbar.querySelector('.hslot.on')
        if (el) {
          const [x, y] = this.fx.at(el)
          this.fx.burst(x, y, { color: ['#ffe6a0', '#ffb23e', '#fff8e0'], n: 22, speed: 170, kind: 'star', grav: 60, life: 0.7 })
          this.fx.ring(x, y, '#ffd27a', 44, 0.4)
        }
      }
      this.lastHeld = p.held
    }
  }

  /** Chop/mine progress: appears on each strike, drains as the tree/boulder weakens. */
  private updateHarvestBar(g: Game): void {
    const h = g.harvestInfo
    const E = this.el
    const show = h.t < 1.6
    E.hbar.classList.toggle('show', show)
    if (!show) {
      this.lastHFrac = 1
      return
    }
    if (h.t < 0.02 || h.frac !== this.lastHFrac) {
      E.hbarName.textContent = h.label
      E.hbarFill.style.width = `${Math.max(0, h.frac) * 100}%`
      E.hbarNote.textContent = h.frac <= 0 ? (h.kind === 'tree' ? '伐採！' : '破壊！') : h.slow ? (h.kind === 'tree' ? '手斧なら効率よく伐採できます' : 'ピッケルなら効率よく採掘できます') : ''
      E.hbar.classList.toggle('slow', h.slow)
      E.hbar.classList.toggle('rock', h.kind === 'rock')
      E.hbar.classList.remove('pulse')
      void E.hbar.offsetWidth
      E.hbar.classList.add('pulse')
      if (h.frac <= 0) {
        const [x, y] = this.fx.at(E.hbarFill, 0, 0.5)
        this.fx.burst(x, y, { color: h.kind === 'tree' ? ['#ffd9a0', '#c99a62', '#9ad26a'] : ['#e8ecf4', '#cfc3ae', '#fff0c8'], n: 26, speed: 190, kind: 'star', grav: 120, life: 0.8 })
      }
      window.setTimeout(() => (E.hbarLost.style.width = `${Math.max(0, h.frac) * 100}%`), 260)
      this.lastHFrac = h.frac
    }
  }

  /** HUD keep-out rectangles (screen px), refreshed on resize: markers never sit on top of them. */
  private hudRects: { l: number; t: number; r: number; b: number; up: boolean }[] = []
  private hudRectsKey = ''
  private hudRectsAt = 0
  private avoidHud(x: number, y: number): [number, number] {
    // Re-measure on resize and about once a second (the objective panel and hotbar change size).
    const now = performance.now()
    const key = `${innerWidth}x${innerHeight}`
    if (key !== this.hudRectsKey || this.hudRects.length === 0 || now - this.hudRectsAt > 1000) {
      this.hudRectsKey = key
      this.hudRectsAt = now
      const pad = 12
      this.hudRects = []
      for (const k of ['compass', 'region', 'hotbar', 'gadget', 'obj', 'hpBar', 'stBar', 'medHeart'] as const) {
        const el = (this.el as unknown as Record<string, HTMLElement | undefined>)[k]
        if (!el || !el.isConnected) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        this.hudRects.push({ l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad, up: r.top > innerHeight / 2 })
      }
    }
    // Resolve a few times in case pushing out of one box lands in another.
    for (let i = 0; i < 3; i++) {
      let moved = false
      for (const R of this.hudRects) {
        // The marker's diamond sits ~20px above its anchor and its distance label ~38px below.
        if (x > R.l && x < R.r && y > R.t - 38 && y < R.b + 20) {
          y = R.up ? R.t - 38 : R.b + 20
          moved = true
        }
      }
      if (!moved) break
    }
    return [x, y]
  }
  frame(dt: number): void {
    const g = this.game
    if (!g) return
    if (this.bannerT > 0) {
      this.bannerT -= dt
      if (this.bannerT <= 0) this.el.banner.classList.remove('on')
    }
    if (this.tipT > 0) {
      this.tipT -= dt
      if (this.tipT <= 0) this.el.tip.classList.remove('on')
    }
    if (this.toastT > 0) {
      this.toastT -= dt
      if (this.toastT <= 0) this.el.toast.classList.remove('on')
    }
    if (this.stampT > 0) {
      this.stampT -= dt
      if (this.stampT <= 0) this.el.stamp.classList.remove('on')
    }
    if (this.jnoteT > 0) {
      this.jnoteT -= dt
      if (this.jnoteT <= 0) this.el.jnote.classList.remove('on')
    }
    this.whiteT = Math.max(0, this.whiteT - dt * 1.4)
    this.el.whiteout.style.opacity = String(this.whiteT)
    if (this.sear && !this.sear.done) {
      // The satchel pauses the sim (dt = 0), so the gauge runs on wall-clock time. Clamp per-frame
      // advance so a frame hitch can never skip the gold band or burn the meal.
      const now = performance.now()
      const real = this.searClock ? (now - this.searClock) / 1000 : 0
      this.searClock = now
      this.sear.t += Math.min(Math.max(dt, real), 1 / 15)
      const n = this.root.querySelector<HTMLElement>('[data-sneedle]')
      const x = this.searPos(this.sear.t)
      if (n) {
        n.style.left = `${x * 100}%`
        n.classList.toggle('burn', this.sear.t > 1.25)
      }
      if (this.sear.t >= 2.5) this.stopSear()
    }
    for (const f of this.feed) {
      f.t += dt
      f.el.style.opacity = String(Math.max(0, Math.min(1, (4 - f.t) / 0.6)))
    }
    this.feed = this.feed.filter(f => (f.t < 4 ? true : (f.el.remove(), false)))
    // Popups follow their world position.
    for (const p of this.popups) {
      p.t += dt
      const k = p.t / p.life
      const s = g.project(p.pos.clone().setY(p.pos.y + k * 1.2))
      p.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${k < 0.12 ? 0.6 + k * 4 : 1})`
      p.el.style.opacity = s.behind ? '0' : String(Math.min(1, (1 - k) * 3))
    }
    this.popups = this.popups.filter(p => (p.t < p.life ? true : (p.el.remove(), false)))
    if (this.screen === 'hud' || this.screen === 'menu' || this.screen === 'faint') this.hud(dt, g)
    if (this.mapOpen) this.drawMap(g)
    if (this.screen === 'victory' || g.mode === 'victory') {
      this.victoryT -= dt
      if (this.victoryT <= 0) {
        this.victoryT = 0.35 + Math.random() * 0.4
        const x = innerWidth * (0.1 + Math.random() * 0.8)
        const y = innerHeight * (0.1 + Math.random() * 0.4)
        this.fx.burst(x, y, { color: ['#ffd27a', '#ff7a3a', '#fff2c8', '#ffb45a'], n: 48, speed: 360, kind: 'star', grav: 180, life: 1.4, size: 11 })
        this.fx.ring(x, y, '#ffc062', 90, 0.6)
      }
    }
    this.fx.update(dt)
  }

  private hud(dt: number, g: Game): void {
    const P = g.player
    const E = this.el
    E.hpFill.style.width = `${(P.hp / P.maxHp) * 100}%`
    E.hpLost.style.width = `${(Math.max(P.hp, P.recentHp) / P.maxHp) * 100}%`
    E.hpText.textContent = `${Math.ceil(P.hp)} / ${P.maxHp}`
    E.stFill.style.width = `${P.stamina}%`
    E.stBar.classList.toggle('flash', P.staminaFlash > 0)
    const stFlash = P.staminaFlash > 0.5
    if (stFlash && !this.lastStFlash) {
      const [x, y] = this.fx.at(E.stBar, 0.02, 0.5)
      this.fx.burst(x, y, { color: ['#5ad0ff', '#c8f2ff'], n: 16, speed: 160, kind: 'dot', grav: 200 })
    }
    this.lastStFlash = stFlash
    const pot = g.progress.inv.poultice ?? 0
    if (this.lastPot >= 0 && pot < this.lastPot) {
      const [x, y] = this.fx.at(E.medHeart)
      this.fx.burst(x, y, { color: ['#9dff9a', '#e6ffe0', '#5ad07a'], n: 30, speed: 200, kind: 'star', grav: -80, life: 1 })
      this.fx.ring(x, y, '#9dff9a', 60, 0.6)
    }
    this.lastPot = pot
    if (this.lastHp >= 0 && P.hp > this.lastHp + 5) E.medHeart.classList.add('heal')
    else if (P.hp < P.maxHp) E.medHeart.classList.remove('heal')
    this.lastHp = P.hp
    E.medHeart.classList.toggle('low', P.hp < P.maxHp * 0.3 && P.alive)
    E.stBar.classList.toggle('low', P.stamina < 25)
    E.potN.textContent = String(g.progress.inv.poultice ?? 0)
    this.updateHotbar(g)
    this.updateHarvestBar(g)
    this.updateGadget(g)
    this.updateMeal(g)
    const exposed = g.heat > 0.05 && !P.stats.heatProof
    E.heatChip.hidden = !exposed
    E.vHeat.style.opacity = String(g.heat > 0.05 ? (exposed ? 0.35 + g.heat * 0.5 : 0.15) : 0)
    this.hurtT = Math.max(0, this.hurtT - dt * 1.8)
    E.vHurt.style.opacity = String(this.hurtT)
    E.vLow.style.opacity = P.hp < P.maxHp * 0.3 && P.alive ? String(0.35 + Math.sin(performance.now() / 180) * 0.2) : '0'
    // Boss bar
    const b = g.boss
    if (b && b.alive) {
      E.boss.hidden = false
      E.bossName.textContent = b.def.name
      E.bossTitle.textContent = b.def.title
      E.bossFill.style.width = `${(b.hp / b.maxHp) * 100}%`
      E.bossLost.style.width = `${(b.hp / b.maxHp) * 100}%`
      const rawTag = b.state === 'stagger' ? 'STAGGERED' : b.open ? 'OPEN' : b.enraged ? 'ENRAGED' : ''
      const tag = rawTag === 'STAGGERED' ? 'ひるみ中' : rawTag === 'OPEN' ? '隙あり' : rawTag === 'ENRAGED' ? '怒り状態' : ''
      E.bossTag.textContent = tag
      E.bossTag.className = `tag ${rawTag === 'ENRAGED' ? 'rage' : tag ? 'open' : ''}`
    } else E.boss.hidden = true
    // Target panel (small creatures)
    const t = g.focusTarget
    if (t && t.alive && !t.def.boss) {
      E.target.hidden = false
      E.tName.textContent = t.def.name
      E.tFill.style.width = `${(t.hp / t.maxHp) * 100}%`
      const rawTag = t.state === 'stagger' ? 'STAGGERED' : t.open ? 'OPEN' : t.state === 'windup' ? 'ATTACKING' : ''
      const tag = rawTag === 'STAGGERED' ? 'ひるみ中' : rawTag === 'OPEN' ? '隙あり' : rawTag === 'ATTACKING' ? '攻撃準備中' : ''
      E.tTag.textContent = tag
      E.tTag.className = `tag ${rawTag === 'ATTACKING' ? 'rage' : tag ? 'open' : ''}`
    } else E.target.hidden = true
    // Objective
    const o = g.objective()
    const key = `${o.id}|${o.detail}|${o.ready}`
    if (key !== this.lastObjective) {
      if (this.lastObjective && this.lastObjective.split('|')[0] !== o.id) {
        this.objectiveFlash = 1.5
        g.audio.play('craft', 0.6)
        requestAnimationFrame(() => this.fx.outline(this.el.obj, { color: ['#ffd27a', '#fff2c8', '#9dff9a'], n: 60, speed: 120, grav: -20, life: 1.2, kind: 'star' }))
      }
      this.lastObjective = key
      E.objStep.textContent = o.id === 'victory' ? '完了' : `目標 ${o.step} / ${o.total}`
      E.objTitle.textContent = o.title
      E.objDetail.textContent = o.ready ? '準備完了 — キャンプのかまどへ戻ろう' : o.detail
      E.obj.classList.toggle('ready', o.ready)
    }
    this.objectiveFlash = Math.max(0, this.objectiveFlash - dt)
    E.obj.classList.toggle('flash', this.objectiveFlash > 0)
    const op = g.objectivePos()
    if (op && g.mode === 'playing') {
      const d = Math.hypot(op.x - P.pos.x, op.z - P.pos.z)
      E.objDist.textContent = `${Math.round(d)} m`
      const s = g.project(op)
      const W = innerWidth
      const H = innerHeight
      let x = s.x
      let y = s.y
      const off = s.behind || x < 40 || x > W - 40 || y < 70 || y > H - 70
      if (s.behind) {
        x = W - x
        y = H - 70
      }
      x = Math.max(40, Math.min(W - 40, x))
      y = Math.max(70, Math.min(H - 70, y))
      ;[x, y] = this.avoidHud(x, y)
      E.marker.style.transform = `translate(${x}px, ${y}px)`
      E.marker.classList.toggle('edge', off)
      E.marker.style.display = d < 4 ? 'none' : ''
      E.markerDist.textContent = `${Math.round(d)}m`
    } else {
      E.marker.style.display = 'none'
      E.objDist.textContent = ''
    }
    // Compass: ring shows north, needle points at the objective (relative to the camera).
    const yaw = g.cam.yaw
    E.compassRing.style.transform = `rotate(${yaw - Math.PI}rad)`
    if (op && g.mode === 'playing') {
      const bearing = Math.atan2(op.x - P.pos.x, op.z - P.pos.z)
      E.needle.style.transform = `rotate(${yaw - bearing}rad)`
      E.needle.style.opacity = '1'
      E.compassDist.textContent = `${Math.round(Math.hypot(op.x - P.pos.x, op.z - P.pos.z))}m`
    } else {
      E.needle.style.opacity = '0'
      E.compassDist.textContent = ''
    }
    // 追跡中の獣: second compass needle + on-screen pin
    const tp = g.trackPos
    if (tp && g.mode === 'playing') {
      const td = Math.hypot(tp.x - P.pos.x, tp.z - P.pos.z)
      const bearing = Math.atan2(tp.x - P.pos.x, tp.z - P.pos.z)
      E.needle2.style.transform = `rotate(${yaw - bearing}rad)`
      E.needle2.style.opacity = '1'
      const s = g.project(tp)
      const vis = !s.behind && s.x > 30 && s.x < innerWidth - 30 && s.y > 60 && s.y < innerHeight - 60 && td > 8
      E.tmarker.style.display = vis ? '' : 'none'
      if (vis) {
        const [tx, ty] = this.avoidHud(s.x, s.y)
        E.tmarker.style.transform = `translate(${tx}px, ${ty}px)`
        E.tmarkerDist.textContent = `${Math.round(td)}m`
      }
    } else {
      E.needle2.style.opacity = '0'
      E.tmarker.style.display = 'none'
    }
    // Lock-on reticle
    if (g.lockTarget) {
      const s = g.project(g.lockTarget.center(new THREE.Vector3()))
      E.reticle.hidden = s.behind
      E.reticle.style.transform = `translate(${s.x}px, ${s.y}px)`
      E.reticle.classList.toggle('open', g.lockTarget.open)
    } else E.reticle.hidden = true
    // Interact prompt
    const it = g.interact
    const promptKey = it ? `${it.verb}|${it.label}|${it.enabled}` : ''
    if (promptKey !== this.lastPrompt) {
      this.lastPrompt = promptKey
      E.prompt.classList.toggle('on', !!it && g.mode === 'playing')
      if (it) {
        E.promptVerb.textContent = it.verb
        E.promptLabel.textContent = it.label
        E.prompt.classList.toggle('disabled', !it.enabled)
      }
    }
    if (!it || g.mode !== 'playing' || P.busy) E.prompt.classList.remove('on')
    else if (it) E.prompt.classList.add('on')
    E.clickLook.classList.toggle('on', g.mode === 'playing' && !document.pointerLockElement && this.screen === 'hud' && !this.mapOpen && !this.helpOpen)
    E.region.textContent = REGION_NAMES[g.region]
  }

  private updateGadget(g: Game): void {
    const p = g.progress
    const gd = p.gadget
    const n = count(p, gd)
    const key = `${gd}|${n}`
    if (key === this.gadgetKey) return
    const E = this.el
    const changed = this.gadgetKey && this.gadgetKey.split('|')[0] !== gd
    const used = this.gadgetKey && this.gadgetKey.split('|')[0] === gd && Number(this.gadgetKey.split('|')[1]) > n
    this.gadgetKey = key
    E.gadgetImg.setAttribute('src', `./ui/icons/${gd}.webp`)
    E.gadgetN.textContent = String(n)
    E.gadgetName.textContent = ITEMS[gd].name
    E.gadget.classList.toggle('empty', n === 0)
    if (changed || used) {
      const [x, y] = this.fx.at(E.gadget)
      this.fx.burst(x, y, { color: gd === 'flashPod' ? ['#ffffff', '#fff6c8', '#bfe8ff'] : ['#d8ff9a', '#fff2c8', '#9ad26a'], n: used ? 26 : 16, speed: 200, kind: 'star', grav: 80, life: 0.7 })
      E.gadget.classList.remove('bump')
      void E.gadget.offsetWidth
      E.gadget.classList.add('bump')
    }
  }

  private updateMeal(g: Game): void {
    const m = g.progress.meal
    const E = this.el
    const key = m ? `${m.id}|${m.q}` : ''
    if (key !== this.mealKey) {
      if (this.mealKey && !m) {
        const [x, y] = this.fx.at(E.mealChip)
        this.fx.burst(x, y, { color: ['#8a6a50', '#d8c6a0'], n: 14, speed: 120, kind: 'dot', grav: -40, life: 0.9 })
      }
      this.mealKey = key
      E.mealChip.hidden = !m
      if (m) {
        E.mealImg.setAttribute('src', `./ui/icons/${m.id}.webp`)
        E.mealName.textContent = MEALS[m.id].name
        E.mealChip.className = `chip meal q-${m.q}`
        E.mealChip.title = `${MEALS[m.id].name}: ${MEALS[m.id].desc}`
      }
    }
    if (m) {
      E.mealRing.style.setProperty('--f', String(Math.max(0, m.t / m.max)))
      E.mealT.textContent = `${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, '0')}`
      E.mealChip.classList.toggle('ending', m.t < 30)
    }
  }

  private drawMap(g: Game): void {
    const c = this.el.mapCanvas as HTMLCanvasElement
    const x = c.getContext('2d')!
    const S = c.width
    const half = WORLD.half
    const toMap = (wx: number, wz: number): [number, number] => [((wx + half) / (2 * half)) * S, ((wz + half) / (2 * half)) * S]
    x.imageSmoothingEnabled = true
    x.drawImage(g.mapImage(), 0, 0, S, S)
    x.fillStyle = 'rgba(20,12,6,.18)'
    x.fillRect(0, 0, S, S)
    x.font = '600 13px Sora, "Noto Sans JP", sans-serif'
    x.textAlign = 'center'
    const label = (t: string, wx: number, wz: number) => {
      const [mx, my] = toMap(wx, wz)
      x.fillStyle = 'rgba(0,0,0,.45)'
      x.fillText(t, mx + 1, my + 1)
      x.fillStyle = '#fff4dc'
      x.fillText(t, mx, my)
    }
    label(REGION_NAMES.coast, 10, 190)
    label(REGION_NAMES.highlands, 80, -20)
    label(REGION_NAMES.caldera, -20, -240)
    // キャンプ
    const [cx, cy] = toMap(CAMP.x, CAMP.z)
    x.fillStyle = '#ffd24a'
    x.strokeStyle = '#2a1c14'
    x.lineWidth = 2
    x.beginPath()
    x.moveTo(cx, cy - 9)
    x.lineTo(cx + 8, cy + 6)
    x.lineTo(cx - 8, cy + 6)
    x.closePath()
    x.fill()
    x.stroke()
    // Bosses
    for (const [s, a] of [['ruinhorn', ARENAS.ruins], ['vulkarr', ARENAS.wyrm]] as const) {
      const [bx, by] = toMap(a.x, a.z)
      const done = g.progress.bosses[s]
      x.fillStyle = done ? 'rgba(120,120,120,.8)' : '#e2412b'
      x.beginPath()
      x.arc(bx, by, 8, 0, Math.PI * 2)
      x.fill()
      x.stroke()
      x.fillStyle = '#fff'
      x.font = '700 10px Sora, "Noto Sans JP", sans-serif'
      x.fillText(done ? '✓' : '!', bx, by + 4)
      x.font = '600 12px Sora, "Noto Sans JP", sans-serif'
      label(SPECIES[s].name, a.x, a.z + 22)
    }
    // Objective
    const op = g.objectivePos()
    if (op) {
      const [ox, oy] = toMap(op.x, op.z)
      const pulse = 7 + Math.sin(performance.now() / 200) * 2
      x.strokeStyle = '#7df9ff'
      x.lineWidth = 3
      x.beginPath()
      x.moveTo(ox, oy - pulse)
      x.lineTo(ox + pulse, oy)
      x.lineTo(ox, oy + pulse)
      x.lineTo(ox - pulse, oy)
      x.closePath()
      x.stroke()
    }
    // 追跡中の獣
    const tp = g.trackPos
    if (tp) {
      const [tx, ty] = toMap(tp.x, tp.z)
      const pr = 9 + Math.sin(performance.now() / 160) * 3
      x.strokeStyle = '#d6ff8a'
      x.lineWidth = 3
      x.beginPath()
      x.arc(tx, ty, pr, 0, Math.PI * 2)
      x.stroke()
      x.fillStyle = '#9ae86a'
      x.beginPath()
      x.arc(tx, ty, 4, 0, Math.PI * 2)
      x.fill()
      if (g.trackSp) label(SPECIES[g.trackSp].name, tp.x, tp.z + 16)
    }
    // Player arrow
    const P = g.player
    const [px, py] = toMap(P.pos.x, P.pos.z)
    x.save()
    x.translate(px, py)
    x.rotate(-P.yaw + Math.PI)
    x.fillStyle = '#ffffff'
    x.strokeStyle = '#1b1208'
    x.lineWidth = 2
    x.beginPath()
    x.moveTo(0, -10)
    x.lineTo(7, 8)
    x.lineTo(0, 4)
    x.lineTo(-7, 8)
    x.closePath()
    x.fill()
    x.stroke()
    x.restore()
  }
}
