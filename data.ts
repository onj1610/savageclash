/**
 * All authored game content as plain data: materials, gear, recipes, camp stages, creature
 * species (stats, telegraphed attacks, drops) and where things live on the island.
 * Gameplay code, the UI and the /enemies lab all read these same tables.
 */
import type { RegionId } from './terrain'

export type IconId =
  | 'log' | 'rock' | 'reed' | 'flint' | 'bone' | 'herb' | 'crystal' | 'shard' | 'sulfur'
  | 'tusk' | 'hide' | 'scale' | 'claw' | 'shell' | 'pelt' | 'plate' | 'horn' | 'crest' | 'heart' | 'potion'
  | 'meat' | 'mushroom' | 'snare' | 'pit' | 'pod'

export type ItemId =
  | 'wood' | 'stone' | 'fiber' | 'flint' | 'bone' | 'herb' | 'amber' | 'obsidian' | 'sulfur'
  | 'hogTusk' | 'roughHide' | 'snapperScale' | 'stalkerClaw' | 'stalkerHide' | 'emberCarapace' | 'ashfangPelt'
  | 'ruinPlate' | 'hornShard' | 'ruinCrest' | 'scorchScale' | 'magmaHeart' | 'poultice'
  | 'meat' | 'glowcap' | 'snare' | 'pitfall' | 'flashPod'

export type ItemKind = 'material' | 'part' | 'key' | 'consumable' | 'gadget'
export type ItemDef = { id: ItemId; name: string; desc: string; kind: ItemKind; icon: IconId; color: string }

const item = (id: ItemId, name: string, kind: ItemKind, icon: IconId, color: string, desc: string): ItemDef => ({ id, name, kind, icon, color, desc })

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: item('wood', '木材', 'material', 'log', '#b07a47', '丈夫な枝や流木。'),
  stone: item('stone', '石', 'material', 'rock', '#a8a29a', '建築に使える、こぶし大の石。'),
  fiber: item('fiber', '葦の繊維', 'material', 'reed', '#b9d36a', '丈夫な葦草。結束や包帯に使う。'),
  flint: item('flint', '火打ち石', 'material', 'flint', '#6d7f96', '岩の中から見つかる、鋭い石。'),
  bone: item('bone', '骨', 'material', 'bone', '#f1e6cc', '古い獣の風化した骨。'),
  herb: item('herb', '癒やし草', 'material', 'herb', '#e0607a', '傷を癒やす、赤みがかった葉。'),
  amber: item('amber', '琥珀石', 'material', 'crystal', '#ffb23e', '高地にある、輝く樹脂の結晶。採掘にはつるはしが必要。'),
  obsidian: item('obsidian', '黒曜石', 'material', 'shard', '#5b4b8a', '火山ガラス。刃のように鋭い。採掘にはつるはしが必要。'),
  sulfur: item('sulfur', '硫黄の結晶', 'material', 'sulfur', '#f2e04a', '明るく燃える硫黄の結晶。'),
  hogTusk: item('hogTusk', 'イノシシの牙', 'part', 'tusk', '#f4ead2', 'タスクホッグから切り出した湾曲した牙。'),
  roughHide: item('roughHide', '剛毛の毛皮', 'part', 'hide', '#9a6440', 'タスクホッグの剛毛に覆われた毛皮。'),
  snapperScale: item('snapperScale', 'マッドスナッパーの鱗', 'part', 'scale', '#5fae8d', 'マッドスナッパーの滑らかな鱗。'),
  stalkerClaw: item('stalkerClaw', 'ストーカーの爪', 'part', 'claw', '#e8d7b0', 'デューンストーカーの鉤爪。'),
  stalkerHide: item('stalkerHide', '縞模様の毛皮', 'part', 'hide', '#d99a4a', '丈夫なデューンストーカーの縞模様の毛皮。'),
  emberCarapace: item('emberCarapace', 'エンバービートルの甲殻', 'part', 'shell', '#c2461f', '熱で鍛えられたエンバービートルの甲殻。'),
  ashfangPelt: item('ashfangPelt', 'アッシュファングの毛皮', 'part', 'pelt', '#6b5a58', '火に強い灰色の毛皮。'),
  ruinPlate: item('ruinPlate', 'ルインホーンの甲板', 'part', 'plate', '#8f8a7a', 'ルインホーンの石のような皮膚から切り出した板。'),
  hornShard: item('hornShard', '角の欠片', 'part', 'horn', '#d7c9a0', '巨大な角の破片。'),
  ruinCrest: item('ruinCrest', 'ルインホーンの紋章', 'key', 'crest', '#e9c46a', '支配者の紋章。信号塔を立てるために必要。'),
  scorchScale: item('scorchScale', '灼熱の鱗', 'part', 'scale', '#ff6a2a', 'まだ熱を帯びたヴァルカーの鱗。'),
  magmaHeart: item('magmaHeart', 'マグマの心臓', 'key', 'heart', '#ff4b12', 'ヴァルカーの燃える心臓。狼煙に火を灯す。'),
  poultice: item('poultice', '癒やし草の湿布', 'consumable', 'potion', '#ff7d95', '体力を回復する。Rキーで使用。'),
  meat: item('meat', '生肉', 'material', 'meat', '#d0645a', '獣から切り出した新鮮な肉。焚き火で焼こう。'),
  glowcap: item('glowcap', '光るキノコ', 'material', 'mushroom', '#62d6ff', '光るキノコ。胞子が閃光を放つ。'),
  snare: item('snare', 'つる罠', 'gadget', 'snare', '#8fbf4a', 'Gキーで設置。獣を4秒拘束し、突進中なら転倒させる。'),
  pitfall: item('pitfall', '落とし穴', 'gadget', 'pit', '#9a7a4e', 'Gキーで掘る。獣が落ちると5秒間動けなくなる。'),
  flashPod: item('flashPod', '閃光玉', 'gadget', 'pod', '#fff3a0', 'Gキーで投げる。正面の獣を目くらましし、攻撃動作を中断させる。'),
}

export const STACK_MAX = 99
export const POULTICE_MAX = 5

// ─── Gadgets (traps and throwables) ────────────────────────────────────────

export type GadgetId = 'snare' | 'pitfall' | 'flashPod'
export const GADGET_ORDER: GadgetId[] = ['snare', 'pitfall', 'flashPod']
/** Carry limit per gadget. */
export const GADGET_MAX: Record<GadgetId, number> = { snare: 3, pitfall: 2, flashPod: 5 }
export const GADGET_TUNING = {
  snareArm: 0.6, snareHold: 4, snareHoldBoss: 2.5, tripTime: 3.5, tripBonus: 1.3, snareRadius: 1.5,
  pitDig: 1.2, pitHold: 5, pitHoldBoss: 3.5, pitRadius: 1.9,
  flashRange: 14, flashRadius: 7, blindTime: 3.5, flashFuse: 0.7,
  bossResist: 30, campNoTrap: 26, trapLife: 120,
}
/** Stack cap for any item. */
export function itemCap(id: ItemId): number {
  if (id === 'poultice') return POULTICE_MAX
  if (id in GADGET_MAX) return GADGET_MAX[id as GadgetId]
  return 99
}

// ─── Hearth meals ─────────────────────────────────────────────────────────

export type MealId = 'heartyHaunch' | 'trailStew' | 'snapperBroth' | 'brimstoneSkewer'
export type MealBuff = { hp?: number; stamina?: number; staRegen?: number; dodgeCost?: number; defense?: number; attack?: number; heatSlow?: number }
export type MealDef = { id: MealId; name: string; stage: 1 | 2; cost: Partial<Record<ItemId, number>>; buff: MealBuff; desc: string }
export const MEALS: Record<MealId, MealDef> = {
  heartyHaunch: { id: 'heartyHaunch', name: '肉厚ステーキ', stage: 1, cost: { meat: 2 }, buff: { hp: 25 }, desc: '最大体力+25' },
  trailStew: { id: 'trailStew', name: '旅人のシチュー', stage: 1, cost: { meat: 1, herb: 2 }, buff: { stamina: 30, staRegen: 0.2 }, desc: '最大スタミナ+30、スタミナ回復+20%' },
  snapperBroth: { id: 'snapperBroth', name: 'スナッパーのスープ', stage: 1, cost: { meat: 1, snapperScale: 1, herb: 1 }, buff: { dodgeCost: 0.25, defense: 0.08 }, desc: '回避のスタミナ消費-25%、防御力+8%' },
  brimstoneSkewer: { id: 'brimstoneSkewer', name: '硫黄焼き', stage: 2, cost: { meat: 1, sulfur: 1 }, buff: { attack: 0.12, heatSlow: 0.6 }, desc: '攻撃力+12%、火口の熱による消耗が60%減少' },
}
export const MEAL_ORDER: MealId[] = ['heartyHaunch', 'trailStew', 'snapperBroth', 'brimstoneSkewer']
export type SearQuality = 'perfect' | 'good' | 'charred'
export const MEAL_DURATION = 300
export const SEAR_MULT: Record<SearQuality, number> = { perfect: 1.5, good: 1, charred: 0.6 }
/** Sear gauge zones as fractions of the sweep (gold inside green). */
export const SEAR_ZONES = { good: [0.52, 0.8] as [number, number], perfect: [0.62, 0.7] as [number, number] }

// ─── Gear ──────────────────────────────────────────────────────────────────

export type GearId =
  | 'club' | 'flintMaul' | 'amberHammer' | 'obsidianClub'
  | 'leafWraps' | 'hideGarb' | 'stalkerPlate' | 'ashguardMantle'
  | 'boneKnife' | 'flintPick' | 'flintHatchet'
  | 'boneSpear' | 'stalkerLance' | 'reedSling' | 'sinewSling'
export type GearSlot = 'weapon' | 'armor' | 'tool'
export type WeaponClass = 'club' | 'maul' | 'spear' | 'sling'
export type GearDef = {
  id: GearId; name: string; slot: GearSlot; tier: number; desc: string
  attack?: number; defense?: number; hp?: number; heatProof?: boolean
  cls?: WeaponClass
}
/** Moveset tuning per weapon class. */
export type ClassDef = { name: string; speed: number; motion: number; reach: number; arc: number; desc: string }
export const WEAPON_CLASSES: Record<WeaponClass, ClassDef> = {
  club: { name: '棍棒', speed: 1.15, motion: 1, reach: 0, arc: 1, desc: '扱いやすく素早い。3連撃と溜め強打が使える。' },
  maul: { name: '大槌', speed: 0.85, motion: 1.3, reach: 0.2, arc: 1.1, desc: '遅いが強烈。最大まで溜めると必ず体勢を崩す。' },
  spear: { name: '槍', speed: 1, motion: 0.95, reach: 1.6, arc: 0.45, desc: '間合いの長い突きと踏み込み攻撃。完璧な回避直後の攻撃で反撃の突きを放つ。' },
  sling: { name: '投石器', speed: 1, motion: 0.8, reach: 0, arc: 1, desc: '石を投げて遠距離攻撃（石1個消費）。強攻撃を長押しして溜め撃ち。' },
}
export const SPEAR_LUNGE = 3
export const COUNTER_WINDOW = 0.5
export const COUNTER_MULT = 2.2
export const SLING_RANGE = 18

export const GEAR: Record<GearId, GearDef> = {
  club: { id: 'club', name: '節付き棍棒', slot: 'weapon', tier: 0, attack: 12, cls: 'club', desc: '硬木の節を活かした頼れる棍棒。' },
  flintMaul: { id: 'flintMaul', name: '火打ち石の大槌', slot: 'weapon', tier: 1, attack: 19, cls: 'maul', desc: '重い柄に火打ち石の頭を固定した大槌。' },
  amberHammer: { id: 'amberHammer', name: '琥珀牙のハンマー', slot: 'weapon', tier: 2, attack: 29, cls: 'maul', desc: '牙の間に輝く琥珀を据えたハンマー。' },
  obsidianClub: { id: 'obsidianClub', name: '黒曜石の大棍棒', slot: 'weapon', tier: 3, attack: 44, cls: 'club', desc: '角の芯に火山ガラスの棘を備えた大棍棒。' },
  boneSpear: { id: 'boneSpear', name: '骨の槍', slot: 'weapon', tier: 1, attack: 17, cls: 'spear', desc: '火打ち石の穂先を付けた骨の柄。長い間合いから反撃の突きを繰り出す。' },
  stalkerLance: { id: 'stalkerLance', name: 'ストーカーランス', slot: 'weapon', tier: 2, attack: 27, cls: 'spear', desc: '柄にデューンストーカーの爪を固定した槍。' },
  reedSling: { id: 'reedSling', name: '葦の投石器', slot: 'weapon', tier: 1, attack: 12, cls: 'sling', desc: '編んだ葦と毛皮で作られている。18m先まで石を飛ばす。' },
  sinewSling: { id: 'sinewSling', name: 'ストーカーの腱の投石器', slot: 'weapon', tier: 2, attack: 19, cls: 'sling', desc: '骨の握りに腱を張った投石器。威力の高い弾を放つ。' },
  leafWraps: { id: 'leafWraps', name: '葉の装備', slot: 'armor', tier: 0, defense: 0, hp: 0, desc: 'ほとんど葉っぱ。' },
  hideGarb: { id: 'hideGarb', name: '剛毛皮の服', slot: 'armor', tier: 1, defense: 0.15, hp: 15, desc: '毛皮と鱗で作ったチュニック。' },
  stalkerPlate: { id: 'stalkerPlate', name: 'ストーカーの骨鎧', slot: 'armor', tier: 2, defense: 0.27, hp: 30, desc: '縞模様の毛皮に骨板を重ねた鎧。' },
  ashguardMantle: { id: 'ashguardMantle', name: '灰守りのマント', slot: 'armor', tier: 3, defense: 0.38, hp: 45, heatProof: true, desc: '灰毛皮の下にルインホーンの甲板を備える。火口の熱を防ぐ。' },
  boneKnife: { id: 'boneKnife', name: '骨の解体ナイフ', slot: 'tool', tier: 1, desc: '狩りのたびに追加で素材を切り出せる。' },
  flintHatchet: { id: 'flintHatchet', name: '火打ち石の手斧', slot: 'tool', tier: 1, attack: 9, desc: '数回の攻撃で木を倒せる。2キーで装備。' },
  flintPick: { id: 'flintPick', name: '火打ち石のつるはし', slot: 'tool', tier: 1, attack: 10, desc: '岩を素早く砕き、琥珀石や黒曜石を採掘できる。3キーで装備。' },
}

// ─── Held item & harvesting (採掘craft-style chopping and mining) ──────────

/** What the hunter has in hand: the equipped weapon, a tool, or bare fists. */
export type HeldId = 'weapon' | 'flintHatchet' | 'flintPick' | 'hands'
export const HELD_ORDER: HeldId[] = ['weapon', 'flintHatchet', 'flintPick', 'hands']
export const HELD_NAMES: Record<Exclude<HeldId, 'weapon'>, string> = { flintHatchet: '火打ち石の手斧', flintPick: '火打ち石のつるはし', hands: '素手' }
/** Bare fists still hurt a little. */
export const FIST_ATTACK = 5

export type ResourceKind = 'tree' | 'rock'
export type ResourceDef = { kind: ResourceKind; name: string; hp: number; yields: [ItemId, number, number]; bonus?: [ItemId, number] }
/** Base "hit points" scale with each instance's size; big trees take longer and give more. */
export const RESOURCES: Record<ResourceKind, ResourceDef> = {
  tree: { kind: 'tree', name: '木', hp: 6, yields: ['wood', 3, 5] },
  rock: { kind: 'rock', name: '大岩', hp: 7, yields: ['stone', 2, 4], bonus: ['flint', 0.6] },
}
/** Harvest power per swing (light). Heavy swings multiply by HEAVY_HARVEST[chargeLevel]. */
export const HARVEST_POWER: Record<HeldId, Record<ResourceKind, number>> = {
  flintHatchet: { tree: 3, rock: 0.7 },
  flintPick: { tree: 0.9, rock: 3 },
  weapon: { tree: 1.1, rock: 1.3 },
  hands: { tree: 0.55, rock: 0.4 },
}
export const HEAVY_HARVEST = [1.6, 2, 2.6]
/** Seconds before a felled tree / broken boulder regrows (only while the hunter is away). */
export const RESOURCE_RESPAWN = 150

export type Cost = Partial<Record<ItemId, number>>
export type RecipeId = GearId | 'poultice' | GadgetId
export type RecipeDef = { id: RecipeId; stage: 1 | 2 | 3; cost: Cost; gear?: GearId; item?: ItemId; count?: number }

export const RECIPES: RecipeDef[] = [
  { id: 'poultice', stage: 1, item: 'poultice', count: 1, cost: { herb: 2, fiber: 1 } },
  { id: 'snare', stage: 1, item: 'snare', count: 1, cost: { fiber: 3, wood: 1 } },
  { id: 'flashPod', stage: 1, item: 'flashPod', count: 1, cost: { glowcap: 1, fiber: 1 } },
  { id: 'pitfall', stage: 2, item: 'pitfall', count: 1, cost: { wood: 3, fiber: 2, bone: 1 } },
  { id: 'flintHatchet', stage: 1, gear: 'flintHatchet', cost: { wood: 2, flint: 1, fiber: 2 } },
  { id: 'flintPick', stage: 1, gear: 'flintPick', cost: { wood: 3, flint: 2, fiber: 1 } },
  { id: 'flintMaul', stage: 1, gear: 'flintMaul', cost: { wood: 4, stone: 3, flint: 2, hogTusk: 2 } },
  { id: 'hideGarb', stage: 1, gear: 'hideGarb', cost: { roughHide: 3, snapperScale: 2, fiber: 4 } },
  { id: 'boneKnife', stage: 1, gear: 'boneKnife', cost: { bone: 3, flint: 2, fiber: 2 } },
  { id: 'boneSpear', stage: 1, gear: 'boneSpear', cost: { bone: 4, wood: 2, flint: 1, fiber: 2 } },
  { id: 'reedSling', stage: 1, gear: 'reedSling', cost: { fiber: 5, roughHide: 1, wood: 1 } },
  { id: 'stalkerLance', stage: 2, gear: 'stalkerLance', cost: { stalkerClaw: 2, bone: 4, wood: 2, amber: 1 } },
  { id: 'sinewSling', stage: 2, gear: 'sinewSling', cost: { stalkerHide: 2, fiber: 4, bone: 2 } },
  { id: 'amberHammer', stage: 2, gear: 'amberHammer', cost: { amber: 3, stalkerClaw: 2, bone: 3, hogTusk: 1 } },
  { id: 'stalkerPlate', stage: 2, gear: 'stalkerPlate', cost: { stalkerHide: 3, bone: 4, amber: 2 } },
  { id: 'ashguardMantle', stage: 3, gear: 'ashguardMantle', cost: { ruinPlate: 2, ashfangPelt: 2, fiber: 4 } },
  { id: 'obsidianClub', stage: 3, gear: 'obsidianClub', cost: { obsidian: 5, emberCarapace: 2, hornShard: 1 } },
]

export const CAMP_STAGES: { stage: 1 | 2 | 3; name: string; desc: string; cost: Cost }[] = [
  { stage: 1, name: '焚き火の野営地', desc: '焚き火に火を戻し、簡易小屋を建てる。基本のクラフトと休息が解放される。', cost: { wood: 6, stone: 5, fiber: 4 } },
  { stage: 2, name: '柵の野営地', desc: '柵を立て、毛皮のテントと作業台を設置する。ティアII装備が解放される。', cost: { wood: 12, stone: 8, bone: 6, roughHide: 3, snapperScale: 2 } },
  { stage: 3, name: '石の砦', desc: '石窯を作り、塔の基礎を壁で囲む。ティアIII装備と塔が解放される。', cost: { stone: 12, amber: 6, stalkerClaw: 3, ruinPlate: 2 } },
]

export const TOWER_COST: Cost = { wood: 10, obsidian: 6, sulfur: 4, ruinCrest: 1, magmaHeart: 1 }

// ─── Creatures ─────────────────────────────────────────────────────────────

export type SpeciesId = 'tuskhog' | 'mudsnapper' | 'dunestalker' | 'emberbeetle' | 'ashfang' | 'ruinhorn' | 'vulkarr'

export type Shape =
  /** Disc centred `forward` metres ahead of the creature (0 = around itself). */
  | { kind: 'circle'; radius: number; forward: number }
  /** Sector in front (or behind) of the creature. `angle` is the full opening in degrees. */
  | { kind: 'cone'; radius: number; angle: number; back?: boolean }
  /** The creature charges down a lane; its body is the hitbox while active. */
  | { kind: 'lane'; length: number; width: number }
  /** Leaps onto the point locked at the end of tracking; hits a disc on landing. */
  | { kind: 'leap'; radius: number; range: number }
  /** Eruptions under and around the target, all marked during the windup. */
  | { kind: 'burst'; radius: number; count: number; scatter: number }
  /** Arcing projectiles that splash a disc where they land (landing spots are marked). */
  | { kind: 'spit'; radius: number; count: number; spread: number; speed: number }

export type AnimId = 'bite' | 'gore' | 'charge' | 'tail' | 'stomp' | 'kick' | 'pounce' | 'claw' | 'spit' | 'roll' | 'breath' | 'spin' | 'erupt' | 'slam' | 'toss'

export type AttackDef = {
  id: string; name: string; desc: string; anim: AnimId
  /** Distance band to the player where the AI may pick this attack. */
  range: [number, number]
  windup: number; active: number; recovery: number
  damage: number; knock: 'flinch' | 'down'
  shape: Shape
  weight: number; cooldown: number
  /** Fraction of the windup during which the creature keeps turning toward the player. */
  tracking: number
  enragedOnly?: boolean
  /** Only picked when the player stands behind the creature. */
  behind?: boolean
}

export type Drop = { item: ItemId; weight: number }
export type SpeciesDef = {
  id: SpeciesId; name: string; title: string; region: RegionId; boss: boolean
  hp: number; poise: number; walk: number; run: number; turn: number
  radius: number; height: number; aggro: number; leash: number
  attacks: AttackDef[]
  drops: Drop[]
  /** Fixed carve rewards for bosses (one entry per carve). */
  bossCarves?: Partial<Record<ItemId, number>>[]
  carves: number
  palette: string[]
  lore: string
  /** Weak zone relative to facing: head = front 50°, rear = back 50°, flank = sides. */
  weak: { zone: HitZone; mult: number; label: string }
  /** Species this predator hunts when it is not fighting the hunter. */
  prey?: SpeciesId[]
  print: PrintKind
  habitat: string
}
export type HitZone = 'head' | 'flank' | 'rear'
export type PrintKind = 'hoof' | 'webbed' | 'talon' | 'insect' | 'paw' | 'giant' | 'wyrm'
/** Predator strike when hunting prey (not the hunter). */
export const PREY_STRIKE = { damage: 38, every: 1.2, detect: 30, cooldown: [45, 90] as [number, number], feed: 12, flee: 8, sneak: 1.5 }
/** Tracking: clues needed to mark a species Tracked; prints fade after this many seconds. */
export const TRACKING = { cluesNeeded: 3, printLife: 90, printSpacing: 2.2, studyRange: 2.6, sightRange: 30 }

const atk = (a: AttackDef): AttackDef => a

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  tuskhog: {
    id: 'tuskhog', name: 'タスクホッグ', title: '剛毛を逆立てたジャングルイノシシ', region: 'coast', boss: false,
    weak: { zone: 'flank', mult: 1.35, label: '側面' }, print: 'hoof',
    habitat: '密林海岸のヤシ林や森の縁を掘り返す。デューンストーカーに狙われ、海辺ではマッドスナッパーに待ち伏せされる。',
    hp: 110, poise: 40, walk: 2.4, run: 7, turn: 5, radius: 1.1, height: 1.3, aggro: 16, leash: 42, carves: 2,
    palette: ['#8a5a3c', '#5a3826', '#f4ead2', '#2b1a12'],
    lore: '縄張り意識が強く、視野は狭い。突進前に地面を前脚でかく。横へ避け、滑って隙を見せたところを狙おう。',
    attacks: [
      atk({ id: 'gore', name: '牙の振り上げ', desc: '正面に牙を素早く振り上げる。', anim: 'gore', range: [0, 3.2], windup: 0.55, active: 0.18, recovery: 0.75, damage: 14, knock: 'flinch', shape: { kind: 'cone', radius: 3.2, angle: 80 }, weight: 3, cooldown: 0.4, tracking: 0.6 }),
      atk({ id: 'charge', name: '剛毛突進', desc: '頭を下げ、一直線に突進する。', anim: 'charge', range: [5, 14], windup: 0.9, active: 0.9, recovery: 1.2, damage: 20, knock: 'down', shape: { kind: 'lane', length: 14, width: 2.6 }, weight: 2, cooldown: 3, tracking: 0.7 }),
    ],
    drops: [{ item: 'hogTusk', weight: 4 }, { item: 'roughHide', weight: 5 }, { item: 'meat', weight: 4 }, { item: 'bone', weight: 2 }],
  },
  mudsnapper: {
    id: 'mudsnapper', name: 'マッドスナッパー', title: '水辺に潜む待ち伏せトカゲ', region: 'coast', boss: false,
    weak: { zone: 'head', mult: 1.3, label: '頭' }, prey: ['tuskhog'], print: 'webbed',
    habitat: '潮際の湿った砂に半ば埋もれて潜み、水辺へ近づいたタスクホッグを待ち伏せする。',
    hp: 80, poise: 30, walk: 2.0, run: 6.2, turn: 6, radius: 1.0, height: 0.9, aggro: 13, leash: 34, carves: 2,
    palette: ['#4f9a7a', '#2f6150', '#f2d27a', '#1a2a24'],
    lore: '潮際に潜み、素早く飛びかかるが、噛みつきの途中で向きを変えられない。側面に回る相手には尻尾で反撃する。',
    attacks: [
      atk({ id: 'lunge', name: '噛みつき突進', desc: '顎を開いて素早く飛びかかる。', anim: 'bite', range: [2, 6.5], windup: 0.5, active: 0.28, recovery: 0.85, damage: 13, knock: 'flinch', shape: { kind: 'lane', length: 6.5, width: 1.9 }, weight: 3, cooldown: 0.8, tracking: 0.65 }),
      atk({ id: 'tail', name: '尻尾払い', desc: '後方へ尻尾を振り回す。', anim: 'tail', range: [0, 3.6], windup: 0.45, active: 0.16, recovery: 0.6, damage: 10, knock: 'flinch', shape: { kind: 'cone', radius: 3.6, angle: 130, back: true }, weight: 4, cooldown: 1, tracking: 0, behind: true }),
    ],
    drops: [{ item: 'snapperScale', weight: 6 }, { item: 'meat', weight: 3 }, { item: 'roughHide', weight: 1 }, { item: 'bone', weight: 2 }],
  },
  dunestalker: {
    id: 'dunestalker', name: 'デューンストーカー', title: '群れで狩る砂漠のラプトル', region: 'highlands', boss: false,
    weak: { zone: 'rear', mult: 1.3, label: '尻尾' }, prey: ['tuskhog'], print: 'talon',
    habitat: '高地の琥珀色の草地を小さな群れで歩き回り、タスクホッグを狙う一方、アッシュファングからは逃げる。',
    hp: 130, poise: 45, walk: 3, run: 8.4, turn: 7, radius: 0.9, height: 1.8, aggro: 22, leash: 50, carves: 2,
    palette: ['#d9a24e', '#8a4d2a', '#2d2018', '#f4e3b8'],
    lore: '二、三体の群れで狩りをする。跳びかかる前に身を低くするので、離れるのではなく着地へ向かって転がって避けよう。',
    attacks: [
      atk({ id: 'pounce', name: '飛びかかり', desc: '身を低くした後、プレイヤーの位置へ飛びかかる。', anim: 'pounce', range: [5, 12], windup: 0.75, active: 0.6, recovery: 0.95, damage: 18, knock: 'down', shape: { kind: 'leap', radius: 2.7, range: 12 }, weight: 3, cooldown: 2.5, tracking: 0.7 }),
      atk({ id: 'rake', name: '爪の一閃', desc: '前脚の爪で大きく切り裂く。', anim: 'claw', range: [0, 3.2], windup: 0.4, active: 0.14, recovery: 0.55, damage: 12, knock: 'flinch', shape: { kind: 'cone', radius: 3.2, angle: 100 }, weight: 3, cooldown: 0.5, tracking: 0.6 }),
    ],
    drops: [{ item: 'stalkerClaw', weight: 4 }, { item: 'stalkerHide', weight: 5 }, { item: 'meat', weight: 3 }, { item: 'bone', weight: 2 }],
  },
  emberbeetle: {
    id: 'emberbeetle', name: 'エンバービートル', title: 'マグマを吐く装甲甲虫', region: 'caldera', boss: false,
    weak: { zone: 'rear', mult: 1.45, label: '柔らかい腹部' }, print: 'insect',
    habitat: 'カルデラの溶岩噴出口近く、温かな黒曜石の上を這い回り、硫黄の地殻を食べる。',
    hp: 210, poise: 90, walk: 1.6, run: 4, turn: 3, radius: 1.35, height: 1.3, aggro: 18, leash: 40, carves: 2,
    palette: ['#3a2622', '#c2461f', '#ffb347', '#1a1210'],
    lore: 'マグマを吐く前には甲殻が光る。距離を詰めよう。追い詰めると転がって攻撃し、その後は仰向けになる。',
    attacks: [
      atk({ id: 'spit', name: 'マグマ吐き', desc: 'プレイヤーの位置へマグマの塊を吐きつける。', anim: 'spit', range: [5, 18], windup: 0.8, active: 0.3, recovery: 0.9, damage: 16, knock: 'flinch', shape: { kind: 'spit', radius: 2.4, count: 1, spread: 0, speed: 15 }, weight: 3, cooldown: 1.6, tracking: 0.8 }),
      atk({ id: 'roll', name: '火の粉転がり', desc: '丸まり、一直線に転がる。', anim: 'roll', range: [2, 10], windup: 1.0, active: 1.0, recovery: 1.4, damage: 22, knock: 'down', shape: { kind: 'lane', length: 12, width: 2.9 }, weight: 2, cooldown: 3, tracking: 0.6 }),
    ],
    drops: [{ item: 'emberCarapace', weight: 5 }, { item: 'sulfur', weight: 3 }, { item: 'bone', weight: 1 }],
  },
  ashfang: {
    id: 'ashfang', name: 'アッシュファング', title: '灰のたてがみを持つ猟犬', region: 'caldera', boss: false,
    weak: { zone: 'flank', mult: 1.3, label: '側面' }, prey: ['dunestalker'], print: 'paw',
    habitat: '高地とカルデラの境に広がる灰の斜面を狩場にする。高原からデューンストーカーを追い詰める。',
    hp: 150, poise: 50, walk: 3, run: 9, turn: 7, radius: 1.0, height: 1.4, aggro: 20, leash: 46, carves: 2,
    palette: ['#5e5150', '#2b2423', '#ff7a2e', '#f2d6b0'],
    lore: '炎をまとって突進する前に、たてがみが燃え上がる。横へ回避し、滑って止まった隙に側面を攻めよう。',
    attacks: [
      atk({ id: 'dash', name: '炎の突進', desc: '炎をまとって駆け抜ける。', anim: 'charge', range: [4, 12], windup: 0.7, active: 0.55, recovery: 1.05, damage: 18, knock: 'down', shape: { kind: 'lane', length: 13, width: 2.3 }, weight: 3, cooldown: 2.2, tracking: 0.7 }),
      atk({ id: 'bite', name: '灼熱の噛みつき', desc: '正面に噛みつく。', anim: 'bite', range: [0, 3], windup: 0.42, active: 0.15, recovery: 0.55, damage: 13, knock: 'flinch', shape: { kind: 'cone', radius: 3, angle: 70 }, weight: 3, cooldown: 0.4, tracking: 0.6 }),
    ],
    drops: [{ item: 'ashfangPelt', weight: 5 }, { item: 'meat', weight: 3 }, { item: 'bone', weight: 2 }, { item: 'sulfur', weight: 1 }],
  },
  ruinhorn: {
    id: 'ruinhorn', name: 'ルインホーン', title: '沈んだ遺跡の暴君', region: 'highlands', boss: true,
    weak: { zone: 'rear', mult: 1.25, label: '後脚' }, print: 'giant',
    habitat: '高地の坂を上った先にある沈んだ遺跡を守る。三本指の足跡が石畳を砕く。',
    hp: 1150, poise: 190, walk: 2.4, run: 7.4, turn: 2.6, radius: 2.7, height: 5.2, aggro: 30, leash: 36, carves: 3,
    palette: ['#8f8a7a', '#5b5448', '#e9c46a', '#2a2622', '#7cc4b0'],
    lore: '石のような皮膚を持つ巨獣で、遺跡を守る。突進後は長く滑る。地震攻撃には欲張らず、余裕をもって退こう。',
    attacks: [
      atk({ id: 'sweep', name: '角の薙ぎ払い', desc: '巨大な角を大きく振り払う。', anim: 'gore', range: [0, 7], windup: 0.8, active: 0.22, recovery: 0.95, damage: 24, knock: 'down', shape: { kind: 'cone', radius: 7.2, angle: 140 }, weight: 3, cooldown: 0.8, tracking: 0.55 }),
      atk({ id: 'rampage', name: '猛進突撃', desc: '長い距離を轟音とともに突進し、滑りながら停止する。', anim: 'charge', range: [8, 30], windup: 1.1, active: 1.5, recovery: 1.9, damage: 32, knock: 'down', shape: { kind: 'lane', length: 30, width: 5.2 }, weight: 3, cooldown: 4, tracking: 0.75 }),
      atk({ id: 'quake', name: '地震踏み', desc: '立ち上がって周囲の地面を揺らす。', anim: 'stomp', range: [0, 7.5], windup: 1.25, active: 0.2, recovery: 1.15, damage: 26, knock: 'down', shape: { kind: 'circle', radius: 8.6, forward: 0 }, weight: 2, cooldown: 5, tracking: 0 }),
      atk({ id: 'kick', name: '後ろ蹴り', desc: '後ろにいる相手を蹴り飛ばす。', anim: 'kick', range: [0, 6], windup: 0.5, active: 0.15, recovery: 0.75, damage: 18, knock: 'flinch', shape: { kind: 'cone', radius: 5.8, angle: 110, back: true }, weight: 5, cooldown: 1.5, tracking: 0, behind: true }),
      atk({ id: 'boulders', name: '瓦礫投げ', desc: '怒り状態で遺跡の瓦礫を投げつける。', anim: 'toss', range: [9, 30], windup: 1.1, active: 0.3, recovery: 1.0, damage: 22, knock: 'down', shape: { kind: 'spit', radius: 3.4, count: 3, spread: 6, speed: 20 }, weight: 3, cooldown: 5, tracking: 0.8, enragedOnly: true }),
    ],
    drops: [],
    bossCarves: [{ ruinCrest: 1 }, { ruinPlate: 2 }, { ruinPlate: 2, hornShard: 1 }, { ruinPlate: 1, bone: 3 }],
  },
  vulkarr: {
    id: 'vulkarr', name: 'ヴァルカー', title: '燃え盛る火口の大蛇', region: 'caldera', boss: true,
    weak: { zone: 'head', mult: 1.25, label: '光る喉' }, print: 'wyrm',
    habitat: 'ブリーチ渓谷を越えた先、シンダー火口の奥深くに巣を作る。歩いた跡の地面は焦げつく。',
    hp: 1750, poise: 250, walk: 2.2, run: 7, turn: 2.4, radius: 3.0, height: 5.6, aggro: 26, leash: 30, carves: 3,
    palette: ['#2a1c1a', '#4a2a22', '#ff6a2a', '#ffd24a', '#15100e'],
    lore: '山の心臓とも呼べる存在。炎の息を吐く前には喉が輝き、噴火は予兆を伴う。立ち止まらず動き続けよう.',
    attacks: [
      atk({ id: 'breath', name: '火炎ブレス', desc: '正面に長い炎を吐く。', anim: 'breath', range: [4, 15], windup: 1.0, active: 1.1, recovery: 1.25, damage: 28, knock: 'down', shape: { kind: 'cone', radius: 15, angle: 48 }, weight: 3, cooldown: 3, tracking: 0.7 }),
      atk({ id: 'spin', name: '尻尾の旋風', desc: '尻尾を伸ばして回転する。', anim: 'spin', range: [0, 7], windup: 0.75, active: 0.4, recovery: 1.05, damage: 24, knock: 'down', shape: { kind: 'circle', radius: 7.8, forward: 0 }, weight: 3, cooldown: 2, tracking: 0 }),
      atk({ id: 'erupt', name: 'マグマ噴出', desc: '咆哮とともに足元の地面を裂く。', anim: 'erupt', range: [0, 30], windup: 1.4, active: 0.3, recovery: 0.85, damage: 26, knock: 'down', shape: { kind: 'burst', radius: 3.4, count: 6, scatter: 9 }, weight: 2, cooldown: 6, tracking: 0.35 }),
      atk({ id: 'leap', name: '火口落とし', desc: '飛び上がり、プレイヤーの位置へ叩きつける。', anim: 'slam', range: [9, 22], windup: 0.9, active: 0.9, recovery: 1.6, damage: 34, knock: 'down', shape: { kind: 'leap', radius: 6.6, range: 22 }, weight: 2, cooldown: 5, tracking: 0.7 }),
      atk({ id: 'fireballs', name: '火の粉連射', desc: '怒り状態で火球を3発吐く。', anim: 'spit', range: [8, 26], windup: 0.9, active: 0.3, recovery: 0.75, damage: 20, knock: 'down', shape: { kind: 'spit', radius: 3, count: 3, spread: 5, speed: 22 }, weight: 3, cooldown: 4, tracking: 0.8, enragedOnly: true }),
    ],
    drops: [],
    bossCarves: [{ magmaHeart: 1 }, { scorchScale: 2 }, { scorchScale: 1, sulfur: 2 }, { scorchScale: 1 }],
  },
}

export const SPECIES_ORDER: SpeciesId[] = ['tuskhog', 'mudsnapper', 'dunestalker', 'emberbeetle', 'ashfang', 'ruinhorn', 'vulkarr']

/** Spawn groups: centre, count and scatter. Placement snaps to valid footing at runtime. */
export type SpawnGroup = { species: SpeciesId; x: number; z: number; count: number; spread: number; shore?: boolean }
export const SPAWNS: SpawnGroup[] = [
  { species: 'tuskhog', x: 58, z: 96, count: 2, spread: 10 },
  { species: 'tuskhog', x: -48, z: 118, count: 2, spread: 10 },
  { species: 'tuskhog', x: 118, z: 150, count: 1, spread: 6 },
  { species: 'tuskhog', x: -120, z: 40, count: 1, spread: 8 },
  { species: 'mudsnapper', x: -40, z: 262, count: 2, spread: 12, shore: true },
  { species: 'mudsnapper', x: 70, z: 238, count: 2, spread: 12, shore: true },
  { species: 'mudsnapper', x: -88, z: 40, count: 1, spread: 8, shore: true },
  { species: 'dunestalker', x: 84, z: -80, count: 2, spread: 8 },
  { species: 'dunestalker', x: -60, z: -62, count: 3, spread: 9 },
  { species: 'dunestalker', x: 176, z: -70, count: 2, spread: 8 },
  { species: 'tuskhog', x: -150, z: -40, count: 2, spread: 8 },
  // Prey herds near predators so the ecology plays out where you can see it.
  { species: 'tuskhog', x: 108, z: -64, count: 2, spread: 8 },
  { species: 'tuskhog', x: 62, z: 222, count: 1, spread: 6 },
  { species: 'ashfang', x: 72, z: -104, count: 2, spread: 8 },
  { species: 'ashfang', x: -124, z: -118, count: 2, spread: 8 },
  { species: 'emberbeetle', x: 22, z: -124, count: 1, spread: 5 },
  { species: 'emberbeetle', x: -62, z: -122, count: 2, spread: 8 },
  { species: 'emberbeetle', x: -104, z: -186, count: 2, spread: 8 },
]

// ─── Gathering ─────────────────────────────────────────────────────────────

/** 採取-up gather nodes. 木材 and stone are no longer nodes: chop trees and mine boulders. */
export type NodeKind = 'fiber' | 'bone' | 'herb' | 'amber' | 'obsidian' | 'sulfur' | 'glowcap'
export type NodeDef = { kind: NodeKind; name: string; verb: string; yields: [ItemId, number, number][]; bonus?: [ItemId, number]; needsPick?: boolean }
export const NODES: Record<NodeKind, NodeDef> = {
  fiber: { kind: 'fiber', name: '葦草', verb: '刈る', yields: [['fiber', 2, 3]] },
  bone: { kind: 'bone', name: '骨の山', verb: '拾う', yields: [['bone', 2, 2]] },
  herb: { kind: 'herb', name: '癒やし草', verb: '採取', yields: [['herb', 2, 2]] },
  amber: { kind: 'amber', name: '琥珀石の鉱脈', verb: '採掘', yields: [['amber', 1, 2]], needsPick: true },
  obsidian: { kind: 'obsidian', name: '黒曜石の欠片', verb: '採掘', yields: [['obsidian', 1, 2]], needsPick: true },
  sulfur: { kind: 'sulfur', name: '硫黄の結晶', verb: '砕く', yields: [['sulfur', 1, 2]] },
  glowcap: { kind: 'glowcap', name: '光るキノコの群生', verb: '採取', yields: [['glowcap', 1, 2]] },
}

/** Which gather node or creature supplies each item (drives objective waypoints). */
export const ITEM_SOURCE: Partial<Record<ItemId, { node?: NodeKind; species?: SpeciesId; resource?: ResourceKind }>> = {
  wood: { resource: 'tree' }, stone: { resource: 'rock' }, flint: { resource: 'rock' }, fiber: { node: 'fiber' },
  bone: { node: 'bone' }, herb: { node: 'herb' }, glowcap: { node: 'glowcap' }, meat: { species: 'tuskhog' }, amber: { node: 'amber' }, obsidian: { node: 'obsidian' }, sulfur: { node: 'sulfur' },
  hogTusk: { species: 'tuskhog' }, roughHide: { species: 'tuskhog' }, snapperScale: { species: 'mudsnapper' },
  stalkerClaw: { species: 'dunestalker' }, stalkerHide: { species: 'dunestalker' }, emberCarapace: { species: 'emberbeetle' },
  ashfangPelt: { species: 'ashfang' }, ruinPlate: { species: 'ruinhorn' }, hornShard: { species: 'ruinhorn' },
  ruinCrest: { species: 'ruinhorn' }, magmaHeart: { species: 'vulkarr' }, scorchScale: { species: 'vulkarr' },
}
