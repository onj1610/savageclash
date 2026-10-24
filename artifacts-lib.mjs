import { ensureSerialImports } from './import-settings.mjs'
import { storageError } from './storage-capacity.mjs'
import { ASSET_UPLOAD_JOURNAL, clearAssetUploadJournal, recordAssetUpload, startAssetUploadJournal } from './asset-upload-journal.mjs'
import {
  LARGE,
  STATE_FILE,
  SKIP_DIRS,
  ensureDistDirectory,
  validateExportDirectory,
  readExportLock,
  tryAcquireExportLock,
  acquireExportLockSync,
  releaseExportLock,
  ASSETS_LOCK_FILE,
  ASSETS_DIR,
  MAX_ASSET_SIZE_BYTES,
  ASSET_EXTS,
  ensureManagedModelGitignore,
  normalizeGroupId,
  defaultGroupName,
  assetTypeOf,
  isManagedAssetRel,
  normalizeAssetEntry,
  readAssetsManifest,
  extOf,
  directAssetUrl,
  projectStorageKey,
  isSafeAssetRel,
  safeLockEntries,
  absentEntries,
  assertAssetsPresent
} from './local-artifacts.mjs'
export {
  ensureDistDirectory,
  validateExportDirectory,
  tryAcquireExportLock,
  releaseExportLock,
  MAX_ASSET_SIZE_BYTES,
  defaultGroupId,
  assetTypeOf,
  readAssetsManifest,
  readAssetsLock,
  directAssetUrl,
  missingAssets,
  isSafeAssetRel,
  assertAssetsPresent
} from './local-artifacts.mjs'
import { createExportReceipt } from './export-receipt.mjs'
import { captureBuildSnapshot, buildSnapshotIdentity, preserveGeneratedImportMetadata, discardBuildSnapshot, recordPreparedSnapshot, snapshotsDirectory, prunePreparedSnapshot, refreshBuildProvenance, recordBuildProvenance } from './build-snapshot.mjs'
import { resolveBuildToolchain } from './build-toolchain.mjs'
import { isModelResourcePath, isSafeLocalModelPath, modelResourceDependencies } from './model-dependencies.mjs'
import { releaseProjection } from './release-profile.mjs'
import { exportFrozenProfile } from './snapshot-export.mjs'
import { hasCachedExport, stampExportCache } from './export-cache.mjs'
import { activatePreview, PREVIEW_STATUS_PATH, readCurrentPreview } from './preview-state.mjs'
import { COLLECTOR_URL, LOGS_URL } from './debug-logs.mjs'
import { GAME_ASSET_PATH } from './preview-assets.mjs'
import { installSite, recoverSiteInstall } from './site-install.mjs'
import { readBackendContract } from '../leaderboard-reference/server/backend-contract.mjs'
import { createReleaseManifest, releaseFiles, RELEASE_MANIFEST, verifyRelease } from './release-manifest.mjs'
import { StorageError, storageConfig, WASM_CONTENT_ENCODING } from './storage.mjs'
import { atReleaseStage, preserveReleaseStage, PUBLISH_DEV_ENDPOINT_ERROR } from './release-diagnostics.mjs'
import { bundledFontData } from './bundled-fonts.mjs'
// Shared release preparation for the Addon CLI and the compatibility checkpoint adapter.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readSync,
  readdirSync,
  renameSync,
  linkSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTemplateOrigin, validateTemplateRetention } from './template-retention.mjs'
import { publishMultiplayerConfig } from './multiplayer-config.mjs'
import { inspectGameToolchain } from './game-toolchain.mjs'
import { GameSharingValidationError, addExportedFavicon, assembleShareSite, canonicalShareSnapshot, ensureProjectShare, installSharePreparation, materializeShareSnapshot, readProjectShare, readSharePreparation } from './share-metadata.mjs'
import { reconcileProvenance, deleteAssetProvenance } from './asset-provenance.mjs'
import { exportedAssetEvidence } from './export-asset-inventory.mjs'
const RELEASE_DIR_NAME = '.release'

function exportLockHolder(root) {
  const owner = readExportLock(root)
  return !owner || owner.dead ? 0 : owner.pid
}

export function exportInProgress(root = process.cwd()) {
  return exportLockHolder(root) !== 0
}


function fileSha256(path) {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const file = openSync(path, 'r')
  try {
    for (;;) {
      const bytes = readSync(file, buffer, 0, buffer.length, null)
      if (!bytes) break
      hash.update(buffer.subarray(0, bytes))
    }
  } finally {
    closeSync(file)
  }
  return 'sha256:' + hash.digest('hex')
}

function validArtifactStoragePath(value, extension) {
  if (typeof value !== 'string' || value.length > 512 || !value.startsWith('/manus-storage/') || !value.endsWith(extension)) return false
  if (/[\\%?#]/.test(value) || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false
  return value.slice('/manus-storage/'.length).split('/').every(part => part && part !== '.' && part !== '..')
}

function uploadToStorage(root, filePath) {
  const script = fileURLToPath(new URL('./upload-file.mjs', import.meta.url))
  let out
  try {
    out = execFileSync(process.execPath, [script, filePath], {
      cwd: root, encoding: 'utf8', timeout: 11 * 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    let diagnostic
    try { diagnostic = JSON.parse(String(error.stderr)) } catch {}
    throw new StorageError(diagnostic?.code, diagnostic?.httpStatus)
  }
  const result = JSON.parse(out)
  if (typeof result.path !== 'string' || !/^\/manus-storage\/game\/sha256\/[a-f0-9]{64}\.[a-z0-9]{1,12}$/.test(result.path)) {
    throw new Error('Invalid storage upload result')
  }
  return result.path
}

function escapeHtmlAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function injectPublishScripts(
  shell,
  remap,
  analytics = {
    endpoint: process.env.VITE_ANALYTICS_ENDPOINT,
    websiteId: process.env.VITE_ANALYTICS_WEBSITE_ID,
  },
) {
  if (!shell.includes('<script')) {
    throw new Error('exported index.html has no <script> tag to anchor the remap patch')
  }
  const remapScript = `<script>(function(){var R=${JSON.stringify(remap)};var f=window.fetch.bind(window);window.fetch=function(i,o){var u=typeof i==="string"?i:(i&&i.url)||"";var b=u.split("?")[0].split("/").pop();return R[b]?f(R[b],o):f(i,o)};})();</script>`
  let analyticsScript = ''
  if (analytics.endpoint && analytics.websiteId) {
    const endpoint = new URL(analytics.endpoint)
    if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
      throw new Error('analytics endpoint must use HTTP or HTTPS')
    }
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/umami`
    analyticsScript = `<script defer src="${escapeHtmlAttribute(endpoint.toString())}" data-website-id="${escapeHtmlAttribute(analytics.websiteId)}"></script>\n`
  }

  // This helper is called only while assembling site/, the publish artifact.
  // dist/ remains analytics-free so Preview and editor verification are not counted.
  return shell.replace('<script', `${analyticsScript}${remapScript}\n<script`)
}

function assembleSite(root, remap, site) {
  const release = join(ensureDistDirectory(root), RELEASE_DIR_NAME)
  validateExportDirectory(root, release)
  rmSync(site, { recursive: true, force: true })
  mkdirSync(site, { recursive: true })
  for (const entry of readdirSync(release)) {
    if (LARGE.includes(entry) || entry === '.build-fingerprint' || entry === '.build-files.json' || entry === '.build-profile.json' || entry === '.export-lock') continue
    cpSync(join(release, entry), join(site, entry), { recursive: true })
  }
  const shellPath = join(site, 'index.html')
  const shell = readFileSync(shellPath, 'utf8')
  const patched = injectPublishScripts(shell, remap)
  // Reject concrete debug/preview service endpoints, not the namespace or
  // preview navigation prefix used by legitimate compatibility code.
  // Match both absolute and ingress-relative endpoints without a leading slash.
  if (
    patched.includes(COLLECTOR_URL.slice(1)) || // browser instrumentation
    patched.includes(LOGS_URL.slice(1)) || // development log uploads
    patched.includes(GAME_ASSET_PATH.slice(1)) || // source-asset access for the editor
    patched.includes(PREVIEW_STATUS_PATH.slice(1)) // development build polling
  ) {
    throw new Error(PUBLISH_DEV_ENDPOINT_ERROR)
  }
  writeFileSync(shellPath, patched)
  publishMultiplayerConfig(root, site)
  let total = 0
  for (const entry of readdirSync(site)) total += statSync(join(site, entry)).size
  return total
}

function readState(root) {
  try {
    const state = JSON.parse(readFileSync(join(root, STATE_FILE), 'utf8'))
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {}
  } catch {
    return {}
  }
}

function writeState(root, patch) {
  const next = { ...readState(root), ...patch }
  const target = join(root, STATE_FILE)
  const content = JSON.stringify(next, null, 2)
  if (!existsSync(target) || readFileSync(target, 'utf8') !== content) writeFileSync(target, content)
  return next
}

function projectGroupId(rel) {
  const parts = rel.split('/').slice(1, -1)
  if (parts[0] === 'template') parts.shift()
  return normalizeGroupId(parts[0]) || 'ungrouped'
}

function isAssetRel(rel) {
  return isManagedAssetRel(rel) && rel.startsWith(`${ASSETS_DIR}/`)
}

function frameSequence(rel) {
  if (!rel.startsWith(`${ASSETS_DIR}/`)) return null
  if (assetTypeOf(rel) !== 'image') return null
  const slash = rel.lastIndexOf('/')
  const dir = rel.slice(0, slash)
  const file = rel.slice(slash + 1)
  const ext = extOf(file)
  const stem = file.slice(0, -ext.length)
  const match = stem.match(/^(.*?)(?:[_ .-]?)(\d+)$/)
  if (!match?.[1]) return null
  return { dir, ext, stem: match[1].replace(/[_ .-]+$/, ''), index: Number(match[2]), rel }
}

function animationName(stem) {
  return stem
    .split(/[_ .-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function selectLogicalFrames(sequence, preferredRels = new Set()) {
  const formatIndices = new Map()
  for (const frame of sequence) {
    const indices = formatIndices.get(frame.ext) || new Set()
    indices.add(frame.index)
    formatIndices.set(frame.ext, indices)
  }
  const preferred = (candidate, current) => {
    const candidateCoverage = formatIndices.get(candidate.ext)?.size || 0
    const currentCoverage = formatIndices.get(current.ext)?.size || 0
    if (candidateCoverage !== currentCoverage) return candidateCoverage > currentCoverage
    const candidatePreferred = preferredRels.has(candidate.rel)
    const currentPreferred = preferredRels.has(current.rel)
    if (candidatePreferred !== currentPreferred) return candidatePreferred
    const candidatePriority = REPRESENTATION_PRIORITY.get(candidate.ext) ?? Number.MAX_SAFE_INTEGER
    const currentPriority = REPRESENTATION_PRIORITY.get(current.ext) ?? Number.MAX_SAFE_INTEGER
    return candidatePriority !== currentPriority
      ? candidatePriority < currentPriority
      : candidate.rel.localeCompare(current.rel) < 0
  }
  const frames = new Map()
  for (const frame of sequence) {
    const current = frames.get(frame.index)
    if (!current || preferred(frame, current)) frames.set(frame.index, frame)
  }
  return [...frames.values()]
}

function animationDescriptor(root, dir, stem) {
  const descriptor = `${dir}/${stem}.animation.json`
  const path = join(root, descriptor)
  if (!existsSync(path)) return { descriptor, explicit: false, invalid: false, value: {} }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { descriptor, explicit: true, invalid: true, value: {} }
    }
    const managed = value.managed === true && value.type === 'frame-animation'
    return { descriptor, explicit: !managed, invalid: false, value }
  } catch {
    return { descriptor, explicit: true, invalid: true, value: {} }
  }
}

function isFrameSequence(sequence, explicitDescriptor) {
  if (sequence.length < 2) return false
  if (explicitDescriptor) return true
  const indices = sequence.map((frame) => frame.index).sort((a, b) => a - b)
  if (!indices.every((index, offset) => offset === 0 || index === indices[offset - 1] + 1)) return false
  const { dir, stem } = sequence[0]
  const directory = dir.slice(dir.lastIndexOf('/') + 1)
  return normalizeGroupId(directory) === normalizeGroupId(stem) ||
    /(?:^|[_ .-])frames?$/i.test(directory) || /^frames?$/i.test(stem)
}

function uint24LE(buffer, offset) {
  return buffer[offset] + buffer[offset + 1] * 256 + buffer[offset + 2] * 65536
}

function jpegDimensions(buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buffer[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 2 > buffer.length) break
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) break
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) }
    }
    offset += length
  }
  return null
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (type === 'VP8X' && size >= 10 && data + 10 <= buffer.length) {
      return { width: uint24LE(buffer, data + 4) + 1, height: uint24LE(buffer, data + 7) + 1 }
    }
    if (type === 'VP8L' && size >= 5 && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const width = 1 + ((buffer[data + 1] | (buffer[data + 2] << 8)) & 0x3fff)
      const height = 1 + (((buffer[data + 2] >> 6) | (buffer[data + 3] << 2) | (buffer[data + 4] << 10)) & 0x3fff)
      return { width, height }
    }
    if (
      type === 'VP8 ' &&
      size >= 10 &&
      data + 10 <= buffer.length &&
      buffer[data + 3] === 0x9d &&
      buffer[data + 4] === 0x01 &&
      buffer[data + 5] === 0x2a
    ) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      }
    }
    if (data + size > buffer.length) return null
    offset = data + size + (size % 2)
  }
  return null
}

function svgDimensions(buffer) {
  const source = buffer.toString('utf8', 0, Math.min(buffer.length, 64 * 1024))
  const svg = source.match(/<svg\b[^>]*>/i)?.[0]
  if (!svg) return null
  const numeric = (name) => {
    const value = svg.match(new RegExp(`\\b${name}\\s*=\\s*["']([0-9]+(?:\\.[0-9]+)?)`, 'i'))?.[1]
    return value ? Number(value) : 0
  }
  const width = numeric('width')
  const height = numeric('height')
  if (width > 0 && height > 0) return { width, height }
  const viewBox = svg.match(/\bviewBox\s*=\s*["']\s*[-+\d.]+[\s,]+[-+\d.]+[\s,]+([-+\d.]+)[\s,]+([-+\d.]+)/i)
  if (!viewBox) return null
  const viewWidth = Number(viewBox[1])
  const viewHeight = Number(viewBox[2])
  return viewWidth > 0 && viewHeight > 0 ? { width: viewWidth, height: viewHeight } : null
}

function imageDimensions(root, rel) {
  const path = join(root, rel)
  const size = Math.min(statSync(path).size, 1024 * 1024)
  const buffer = Buffer.alloc(size)
  const fd = openSync(path, 'r')
  let bytesRead = 0
  try {
    while (bytesRead < size) {
      const count = readSync(fd, buffer, bytesRead, size - bytesRead, bytesRead)
      if (!count) break
      bytesRead += count
    }
  } finally {
    closeSync(fd)
  }
  const header = bytesRead === size ? buffer : buffer.subarray(0, bytesRead)
  const ext = extOf(path)
  let dimensions = null
  if (ext === '.png' && header.length >= 24 && header.toString('hex', 0, 8) === '89504e470d0a1a0a') {
    dimensions = { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } else if ((ext === '.jpg' || ext === '.jpeg') && header.length >= 4 && header[0] === 0xff && header[1] === 0xd8) {
    dimensions = jpegDimensions(header)
  } else if (ext === '.webp') {
    dimensions = webpDimensions(header)
  } else if (ext === '.gif' && header.length >= 10 && header.toString('ascii', 0, 3) === 'GIF') {
    dimensions = { width: header.readUInt16LE(6), height: header.readUInt16LE(8) }
  } else if (ext === '.bmp' && header.length >= 26 && header.toString('ascii', 0, 2) === 'BM') {
    dimensions = { width: Math.abs(header.readInt32LE(18)), height: Math.abs(header.readInt32LE(22)) }
  } else if (ext === '.ico' && header.length >= 8 && header.readUInt16LE(2) === 1) {
    dimensions = { width: header[6] || 256, height: header[7] || 256 }
  } else if (ext === '.svg') {
    dimensions = svgDimensions(header)
  }
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error(`cannot determine animation frame dimensions: ${rel}`)
  }
  return dimensions
}

function animationSequences(root, rels, preferredRels) {
  const sequences = new Map()
  for (const rel of rels) {
    const frame = frameSequence(rel)
    if (!frame) continue
    // Alternate representations have already been removed by the caller, so
    // keep unique mixed-format frames in the same logical sequence.
    const key = `${frame.dir}\0${frame.stem}`
    const sequence = sequences.get(key) || []
    sequence.push(frame)
    sequences.set(key, sequence)
  }
  return [...sequences.values()].map(
    sequence => selectLogicalFrames(sequence, preferredRels),
  ).filter((sequence) => {
    sequence.sort((a, b) => a.index - b.index || a.rel.localeCompare(b.rel))
    const { dir, stem } = sequence[0]
    const { explicit, invalid } = animationDescriptor(root, dir, stem)
    return !invalid && isFrameSequence(sequence, explicit)
  })
}

function validateAnimationSequenceDimensions(root, sequence) {
  const first = sequence[0]
  const expected = imageDimensions(root, first.rel)
  for (const frame of sequence.slice(1)) {
    const actual = imageDimensions(root, frame.rel)
    if (actual.width !== expected.width || actual.height !== expected.height) {
      throw new Error(
        `animation frames must use one canvas size: ${first.rel} is ${expected.width}x${expected.height}, ` +
          `but ${frame.rel} is ${actual.width}x${actual.height}`,
      )
    }
  }
}

function validateAnimationFrameDimensions(root, rels) {
  for (const sequence of animationSequences(root, rels)) {
    validateAnimationSequenceDimensions(root, sequence)
  }
}

function writeAnimationDescriptor(root, descriptor, value) {
  const path = join(root, descriptor)
  const content = `${JSON.stringify(value, null, 2)}\n`
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return
  const tmp = `${path}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, content)
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

function removeStaleAnimationDescriptors(root, active) {
  const assetsRoot = join(root, ASSETS_DIR)
  if (!existsSync(assetsRoot)) return
  const walk = (dir, relDir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), rel)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.animation.json') || active.has(rel)) continue
      try {
        const value = JSON.parse(readFileSync(join(root, rel), 'utf8'))
        if (value?.managed === true && value.type === 'frame-animation') rmSync(join(root, rel))
      } catch {
        continue
      }
    }
  }
  walk(assetsRoot, ASSETS_DIR)
}

function rebuildAnimationBundles(root, manifest) {
  const bundles = {}
  const descriptors = new Set()
  const primaryAssets = new Set(Object.entries(manifest.assets)
    .filter(([, entry]) => !entry.alternateOf)
    .map(([rel]) => rel))
  for (const sequence of animationSequences(root, Object.keys(manifest.assets), primaryAssets)) {
    // The early preflight sees all local representations. Recheck the exact
    // primary frames because alternate selection can change the final bundle.
    validateAnimationSequenceDimensions(root, sequence)
    const { dir, stem } = sequence[0]
    const { descriptor, explicit: explicitDescriptor, value } = animationDescriptor(root, dir, stem)
    const baseId = normalizeGroupId(`${dir.slice(`${ASSETS_DIR}/`.length)}-${stem}`) || 'animation'
    let id = baseId
    for (let suffix = 2; Object.hasOwn(bundles, id); suffix++) id = `${baseId}-${suffix}`
    const frames = sequence.map((frame) => frame.rel)
    bundles[id] = {
      name:
        typeof value.name === 'string' && value.name.trim()
          ? value.name.trim()
          : animationName(/^frames?$/i.test(stem) ? dir.slice(dir.lastIndexOf('/') + 1) : stem),
      assetType: 'animation',
      groupId: manifest.assets[frames[0]].groupId,
      frames,
      fps: Number.isFinite(value.fps) ? Math.min(60, Math.max(1, value.fps)) : 12,
      loop: value.loop !== false,
      coverFrame: frames.includes(value.coverFrame) ? value.coverFrame : frames[0],
      descriptor,
    }
    if (!explicitDescriptor) {
      writeAnimationDescriptor(root, descriptor, {
        version: 1,
        type: 'frame-animation',
        managed: true,
        name: bundles[id].name,
        fps: bundles[id].fps,
        loop: bundles[id].loop,
        coverFrame: bundles[id].coverFrame,
        frames,
      })
    }
    descriptors.add(descriptor)
  }
  removeStaleAnimationDescriptors(root, descriptors)
  manifest.bundles = bundles
}

const REPRESENTATION_PRIORITY = new Map([
  ['.svg', 0],
  ['.png', 1],
  ['.webp', 2],
  ['.jpg', 3],
  ['.jpeg', 4],
  ['.gif', 5],
  ['.bmp', 6],
  ['.ico', 7],
])

function rebuildAlternateFormats(manifest, refs) {
  const representations = new Map()
  for (const [rel, entry] of Object.entries(manifest.assets)) {
    delete entry.alternateOf
    if (entry.assetType !== 'image') continue
    const extension = extOf(rel)
    const key = rel.slice(0, -extension.length)
    const values = representations.get(key) || []
    values.push({ rel, entry, extension })
    representations.set(key, values)
  }
  for (const values of representations.values()) {
    if (values.length < 2 || new Set(values.map(({ entry }) => entry.groupId)).size !== 1) continue
    const referenced = values.filter(({ rel }) => refs.has(rel))
    // If multiple representations are referenced, they are independent game
    // assets rather than interchangeable encodings of one logical image.
    if (referenced.length > 1) continue
    const primary = (referenced.length === 1 ? referenced : values)
      .sort((a, b) =>
        (REPRESENTATION_PRIORITY.get(a.extension) ?? Number.MAX_SAFE_INTEGER) -
          (REPRESENTATION_PRIORITY.get(b.extension) ?? Number.MAX_SAFE_INTEGER) ||
        a.rel.localeCompare(b.rel),
      )[0]
    if (!primary) continue
    for (const value of values) {
      if (value !== primary) value.entry.alternateOf = primary.rel
    }
  }
}

function retainAssetGroups(manifest, preserveGroups = false) {
  const groups = Object.assign(Object.create(null), preserveGroups ? manifest.groups : {})
  for (const entry of Object.values(manifest.assets)) {
    if (Object.hasOwn(groups, entry.groupId)) continue
    groups[entry.groupId] = manifest.groups[entry.groupId] || {
      name: defaultGroupName(entry.groupId),
      order: Object.keys(groups).length * 10 + 10,
    }
  }
  manifest.groups = groups
  return manifest
}

export function writeAssetsManifest(root, manifest, { preserveGroups = false } = {}) {
  retainAssetGroups(manifest, preserveGroups)
  const groups = {}
  const bundles = {}
  const assets = {}
  for (const key of Object.keys(manifest.groups).sort()) groups[key] = manifest.groups[key]
  for (const key of Object.keys(manifest.bundles || {}).sort()) bundles[key] = manifest.bundles[key]
  for (const key of Object.keys(manifest.assets).sort()) assets[key] = manifest.assets[key]
  const output = { version: 2, groups, bundles, assets }
  const lockPath = join(root, ASSETS_LOCK_FILE)
  const content = `${JSON.stringify(output, null, 2)}\n`
  // Keep a verified no-op quiet on disk as well as on the network.
  if (existsSync(lockPath) && lstatSync(lockPath).isFile() && readFileSync(lockPath, 'utf8') === content) {
    clearAssetUploadJournal(root)
    return output
  }
  const tmp = `${lockPath}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, content)
    renameSync(tmp, lockPath)
    clearAssetUploadJournal(root)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
  return output
}

export function deleteAsset(root, rel) {
  if (!isSafeAssetRel(root, rel) && !isSafeLocalModelPath(root, rel)) throw new Error(`invalid asset path: ${rel}`)
  const manifest = readAssetsManifest(root)
  // The caller confirms that this exact working-copy asset is no longer needed.
  // Static `used` hints cannot decide that, including for template media.
  rmSync(join(root, rel), { force: true })
  rmSync(`${join(root, rel)}.import`, { force: true })
  delete manifest.assets[rel]
  writeAssetsManifest(root, manifest)
  if (existsSync(join(root, 'project.godot'))) deleteAssetProvenance(root, rel)
}

// Sharing content is optional. Storage/write failures still propagate; only
// invalid or missing presentation input may fall back to an undecorated game.
function optionalSharing(action, log = console.warn) {
  try { return action() }
  catch (error) {
    if (!(error instanceof GameSharingValidationError) && !(error instanceof SyntaxError) && error?.code !== 'ENOENT') throw error
    log('[sharing] warning: sharing content could not be fully prepared. Check game-sharing.json and its images; run game/sharing/prepare before rebuilding. The game build will continue.')
    return null
  }
}

const REF_SOURCE_EXTS = ['.gd', '.tscn', '.tres', '.godot', '.cfg']

// One pass over the text tree, so marking assets is a Set lookup rather than a
// scan per asset. Paths built at runtime are invisible here — callers must treat
// an unreferenced asset as a hint, never as grounds for dropping it.
function collectResourceRefs(root, log = console.log) {
  const refs = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile() || !REF_SOURCE_EXTS.includes(extOf(entry.name))) continue
      let text
      try {
        text = readFileSync(join(dir, entry.name), 'utf8')
      } catch (err) {
        log(`[assets] warning: could not scan ${entry.name}: ${err?.message || err}`)
        continue
      }
      // Paths appear inside quoted strings; spaces and parens are legal in them.
      for (const m of text.matchAll(/res:\/\/([^"'\n\r]+)/g)) {
        refs.add(m[1].split('::')[0].trim())
      }
    }
  }
  walk(root)
  const sharing = optionalSharing(() => readProjectShare(root), log)
  if (sharing) for (const path of Object.values(sharing.assets)) refs.add(path)
  // Texture/buffer membership follows a referenced model, not fake gameplay preloads.
  for (const model of [...refs].filter(isModelResourcePath)) {
    if (!existsSync(join(root, model))) continue
    try {
      for (const dependency of modelResourceDependencies(root, model)) refs.add(dependency)
    } catch (err) {
      // This advisory scan also sees comments and unreachable developer files.
      // Import/export still validates the game's actual resource dependencies.
      log(`[assets] warning: ${String(err?.message || err).slice(0, 400)}`)
    }
  }
  return refs
}

// The only media shipped as template source rather than an assets.lock entry.
const BUNDLED_TEMPLATE_MEDIA = new Set(['assets/template/ui/loading-background.png', 'assets/template/icon.svg'])

export function listLocalAssets(root) {
  const found = []
  const walk = (dir, relDir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && rel !== `${ASSETS_DIR}/template/addons/gut`) walk(join(dir, entry.name), rel)
      } else if (entry.isFile() && ASSET_EXTS.has(extOf(entry.name))) {
        found.push(rel)
      }
    }
  }
  const assetsRoot = join(root, ASSETS_DIR)
  if (existsSync(assetsRoot)) {
    if (lstatSync(assetsRoot).isSymbolicLink()) throw new Error('assets directory must not be a symbolic link')
    walk(assetsRoot, ASSETS_DIR)
  }
  return found.sort()
}

// Shared by synchronous checkpoint restore and the concurrent preview CLI.
export function assetDownloadRequest(entry, rel) {
  const directUrl = directAssetUrl(entry)
  if (directUrl) return { url: directUrl, presign: false, headers: [] }
  const { url, key } = storageConfig()
  if (!url || !key) throw new Error(`cannot restore ${rel}: storage API not configured`)
  const storageKey = projectStorageKey(entry.path)
  if (!storageKey) throw new Error(`cannot restore ${rel}: invalid storage path`)
  const presign = new URL('v1/storage/presign/get', `${url}/`)
  presign.searchParams.set('path', storageKey)
  return { url: presign.toString(), presign: true, headers: ['-H', `Authorization: Bearer ${key}`] }
}

export function verifyDownloadedAsset(path, entry, rel) {
  const gotSize = statSync(path).size
  if (!Number.isSafeInteger(gotSize) || (assetTypeOf(rel) !== 'font' && gotSize > MAX_ASSET_SIZE_BYTES) || (entry.size && gotSize !== entry.size)) {
    throw new Error(`restored ${rel} does not match its recorded size`)
  }
  if (entry.sha256 && fileSha256(path) !== entry.sha256) {
    throw new Error(`restored ${rel} does not match its recorded content hash`)
  }
}

function downloadFromStorage(root, entry, rel) {
  const bundled = bundledFontData(entry)
  const request = bundled ? null : assetDownloadRequest(entry, rel)
  let signed = request?.url
  if (request?.presign) {
    const resp = execFileSync('curl', ['-fsS', ...request.headers, request.url], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    signed = JSON.parse(resp).url
  }
  if (!bundled && !signed) throw new Error(`cannot restore ${rel}: empty download URL`)
  const target = join(root, rel)
  const tmp = `${target}.download`
  mkdirSync(dirname(target), { recursive: true })
  // A partial file matches no ignore rule and would be committed truncated.
  try {
    if (bundled) {
      writeFileSync(tmp, bundled)
    } else {
      const curlFlags = request.presign ? '-fsSL' : '-fsS'
      execFileSync(
        'curl',
        [
          curlFlags,
          '--retry',
          '3',
          '--retry-delay',
          '1',
          '--retry-all-errors',
          ...(assetTypeOf(rel) === 'font' ? [] : ['--max-filesize', String(MAX_ASSET_SIZE_BYTES)]),
          '-o',
          tmp,
          signed,
        ],
        { timeout: 10 * 60_000, stdio: ['ignore', 'pipe', 'pipe'] },
      )
    }
    verifyDownloadedAsset(tmp, entry, rel)
    if (!isSafeAssetRel(root, rel)) throw new Error(`invalid asset path: ${rel}`)
    try { linkSync(tmp, target) } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    rmSync(tmp, { force: true })
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}

// Restores what the lock records and the disk lacks. Never uploads and never
// deletes lock entries — that bookkeeping belongs to syncAssets.
export function hydrateAssets(root = process.cwd(), log = console.log) {
  const lock = readAssetsManifest(root).assets
  const safe = safeLockEntries(root, lock, log)
  if (!safe.length) return 0
  const targets = absentEntries(root, lock)
  if (!targets.length) return 0
  let hydrated = 0
  for (const rel of targets) {
    log(`[assets] restoring ${rel}...`)
    downloadFromStorage(root, lock[rel], rel)
    hydrated++
  }
  log(`[assets] restored ${hydrated} file(s)`)
  return hydrated
}

// Upload new/changed assets and restore missing tracked assets.
export function syncAssets(root = process.cwd(), { engine = 'godot', log = console.log, onSummary = () => {} } = {}) {
  if (!['godot', 'threejs'].includes(engine)) throw new Error('unsupported game engine')
  const threejs = engine === 'threejs'
  const save = manifest => writeAssetsManifest(root, manifest, { preserveGroups: threejs })
  const manifest = readAssetsManifest(root)
  if (existsSync(join(root, ASSET_UPLOAD_JOURNAL))) save(manifest)
  const lock = manifest.assets
  const local = listLocalAssets(root)
  const localPaths = new Set(local)
  for (const rel of safeLockEntries(root, lock, log)) {
    if (existsSync(join(root, rel)) && !localPaths.has(rel)) {
      local.push(rel)
      localPaths.add(rel)
    }
  }
  local.sort()
  let uploaded = 0
  let hydrated = 0

  for (const rel of local) {
    const size = statSync(join(root, rel)).size
    if (!Number.isSafeInteger(size) || size <= 0 || (assetTypeOf(rel) !== 'font' && size > MAX_ASSET_SIZE_BYTES)) {
      throw new Error(`asset size is outside the supported range: ${rel}`)
    }
  }

  for (const rel of safeLockEntries(root, lock, log)) {
    if (existsSync(join(root, rel))) continue
    log(`[assets] restoring ${rel}...`)
    downloadFromStorage(root, lock[rel], rel)
    local.push(rel)
    hydrated++
  }

  local.sort()
  if (threejs) {
    // Validate complete model metadata and local dependencies before paid uploads.
    // Browser loading and decoder compatibility are verified by the game's build/Preview.
    for (const rel of local.filter(isModelResourcePath)) modelResourceDependencies(root, rel)
  } else validateAnimationFrameDimensions(root, local)

  try {
    for (const rel of local) {
      const abs = join(root, rel)
      const size = statSync(abs).size
      if (!Number.isSafeInteger(size) || size <= 0 || (assetTypeOf(rel) !== 'font' && size > MAX_ASSET_SIZE_BYTES)) {
        throw new Error(`asset size is outside the supported range: ${rel}`)
      }
      const sha = fileSha256(abs)
      const entry = lock[rel]
      if (!entry && rel.startsWith(`${ASSETS_DIR}/template/`) && !BUNDLED_TEMPLATE_MEDIA.has(rel)) {
        throw new Error(`new project assets must not be added under assets/template: ${rel}`)
      }
      if (entry?.groupId === 'template' && projectStorageKey(entry.path)) {
        entry.groupId = projectGroupId(rel)
      }
      if (entry && entry.sha256 === sha && entry.path) continue
      log(`[assets] uploading ${rel}...`)
      lock[rel] = normalizeAssetEntry(rel, {
        ...(threejs ? entry : {}),
        groupId: !entry || entry.groupId === 'template' ? projectGroupId(rel) : entry.groupId,
        path: uploadToStorage(root, abs),
        sha256: sha,
        size,
      })
      if (uploaded === 0) {
        ensureDistDirectory(root)
        const path = join(root, ASSETS_LOCK_FILE)
        startAssetUploadJournal(root, existsSync(path) ? readFileSync(path, 'utf8') : '')
      }
      recordAssetUpload(root, rel, lock[rel])
      uploaded++
    }
  } finally {
    // Preserve completed uploads on ordinary failure too. Hard termination is
    // recovered from the per-upload journal by readAssetsManifest.
    if (uploaded > 0) save(manifest)
  }

  let unused = [], dangling = []
  if (!threejs) {
    const refs = collectResourceRefs(root, log)
    rebuildAlternateFormats(manifest, refs)
    rebuildAnimationBundles(root, manifest)
    const bundledFrames = new Set(Object.values(manifest.bundles).flatMap((bundle) => bundle.frames))
    const tracked = safeLockEntries(root, lock, () => {})
    for (const rel of tracked) lock[rel].used = refs.has(rel) || bundledFrames.has(rel)
    unused = tracked.filter((rel) => !lock[rel].used)
    dangling = [...refs].filter(
      (rel) => rel.startsWith(`${ASSETS_DIR}/`) && ASSET_EXTS.has(extOf(rel)) && !lock[rel] && !existsSync(join(root, rel)),
    )
    if (unused.length) log(`[assets] ${unused.length} tracked asset(s) are not referenced: ${unused.slice(0, 5).join(', ')}`)
    if (dangling.length) log(`[assets] WARNING: ${dangling.length} reference(s) point at missing art: ${dangling.slice(0, 5).join(', ')}`)
  }

  save(manifest)
  // Three.js CLI installs portable build recovery before excluding exact asset paths.
  // The shared uploader alone must not change its Git tracking.
  if (!threejs) {
    ensureManagedModelGitignore(root, manifest)
    if (existsSync(join(root, 'project.godot'))) refreshBuildProvenance(root, { manifest })
  }
  log(
    `[assets] in sync: ${Object.keys(lock).length} tracked, ${uploaded} uploaded, ${hydrated} restored`,
  )
  onSummary({ tracked: Object.keys(lock).length, uploaded, restored: hydrated, unchanged: local.length - uploaded - hydrated, unreferenced: unused.length, missingReferences: dangling.length })
  return lock
}

/**
 * Ensure the exported build matches current sources, upload changed
 * artifacts (dedup by content hash), rebuild ./site, persist state.
 * Returns { pck_url, wasm_url, engine_version, source_fingerprint }.
 */
export function prepareArtifacts(root = process.cwd()) {
  // Hold the lock for the whole prepare so no other exporter rewrites dist/.
  acquireExportLockSync(root)
  try {
    return atReleaseStage('preparation', () => prepareArtifactsLocked(root))
  } catch (error) {
    error = preserveReleaseStage(error, storageError(error))
    try { refreshBuildProvenance(root) } catch { /* Preserve the original build diagnostic. */ }
    throw error
  } finally {
    releaseExportLock(root)
  }
}

// Metadata preparation is short and never waits behind a long Godot export.
// The MCP supplies only the trusted publication origin. Editable metadata and
// images remain ordinary project files and assets.
export function prepareSharing(root, input) {
  if (!tryAcquireExportLock(root)) throw new Error('Game sharing preparation is busy; retry after the current game build finishes')
  try {
    const sharing = readProjectShare(root)
    const preparation = installSharePreparation(root, input)
    if (!sharing) ensureProjectShare(root)
    return preparation
  } finally { releaseExportLock(root) }
}

function prepareArtifactsLocked(root) {
  recoverSiteInstall(root)
  readBackendContract(root)
  let templateValidation
  let origin
  try {
    origin = readTemplateOrigin(root)
    templateValidation = validateTemplateRetention(root, origin)
  } catch (error) {
    error.code = 'GAME_TEMPLATE_VALIDATION_FAILED'
    throw error
  }
  console.log('[artifacts] template validation: ' + JSON.stringify(templateValidation))
  ensureSerialImports(root)
  // Reject all known release dependency failures before synchronization/export.
  releaseProjection(root)
  // Reject local prerequisites before paid storage work or manifest mutations.
  // The captured source is checked again below, so concurrent edits cannot make
  // this preflight substitute for validation of the actual frozen candidate.
  const toolchain = resolveBuildToolchain(root)
  const sharePreparation = optionalSharing(() => readSharePreparation(root))
  optionalSharing(() => readProjectShare(root) ?? (sharePreparation ? ensureProjectShare(root) : null))
  // Uploads mutate assets.lock.json, which feeds the fingerprint below.
  atReleaseStage('asset_sync', () => syncAssets(root))
  const snapshot = captureBuildSnapshot(root, toolchain.identity)
  let retained = false
  try {
    validateTemplateRetention(snapshot.project, origin)
    assertAssetsPresent(snapshot.project)
    let sharing = optionalSharing(() => materializeShareSnapshot(snapshot.project, sharePreparation))
    let build = buildSnapshotIdentity(snapshot)
    let previewStaging = null
    let previewExport = null
    let refreshPreviewSharing = false
    const preview = readCurrentPreview(root)
    const previewCache = join(root, 'dist', '.preview-export-cache')
    // Import the complete preview source first, including developer scripts. Its
    // new UID sidecars must be part of A before release removes those scripts.
    if (preview?.build?.snapshotId !== build.snapshotId || preview.build.profile !== 'preview' || !preview.build.export) {
      if (hasCachedExport(root, previewCache, build.snapshotId)) {
        previewStaging = join(snapshot.project, 'dist', '.preview-next')
        cpSync(previewCache, previewStaging, { recursive: true })
      } else {
        previewStaging = atReleaseStage('engine_export', () => exportFrozenProfile(snapshot, toolchain, 'preview'))
      }
      build = buildSnapshotIdentity(snapshot)
      previewExport = createExportReceipt(previewStaging, 'preview', build.snapshotId)
    }
    const cached = join(root, 'dist', RELEASE_DIR_NAME)
    const release = join(snapshot.project, 'dist', RELEASE_DIR_NAME)
    const reusedRelease = hasCachedExport(root, cached, build.snapshotId)
    if (reusedRelease) {
      console.log('[artifacts] matching frozen release — reusing build')
      mkdirSync(dirname(release), { recursive: true })
      cpSync(cached, release, { recursive: true })
    } else {
      atReleaseStage('engine_export', () => exportFrozenProfile(snapshot, toolchain, 'release'))
      build = buildSnapshotIdentity(snapshot)
    }
    const fingerprint = build.snapshotId
    if ((previewExport?.snapshotId ?? preview?.build?.snapshotId) !== fingerprint) {
      previewStaging = atReleaseStage('engine_export', () => exportFrozenProfile(snapshot, toolchain, 'preview'))
      if (buildSnapshotIdentity(snapshot).snapshotId !== fingerprint) {
        throw new Error('Game release preview modified the frozen release inputs; retry preparation')
      }
      previewExport = createExportReceipt(previewStaging, 'preview', fingerprint)
    }
    // Persist validated engine output before storage/network work. A failed upload
    // must not throw away completed exports or publish a new Preview/site pointer.
    validateExportDirectory(snapshot.project, release)
    sharing = optionalSharing(() => addExportedFavicon(sharing, release)) ?? sharing
    // Redecorate from raw output, including removal of the previous sharing data.
    // Copying the active generation would retain stale HTML and share files.
    if (!previewStaging && preview) {
      const metadata = join(root, 'dist/.preview/builds', preview.generation, 'game-sharing.json')
      const actual = existsSync(metadata) ? readFileSync(metadata, 'utf8') : null
      const expected = sharing ? canonicalShareSnapshot(sharing.snapshot) : null
      if (actual !== expected) {
        if (hasCachedExport(root, previewCache, fingerprint)) {
          previewStaging = join(snapshot.project, 'dist', '.preview-next')
          cpSync(previewCache, previewStaging, { recursive: true })
          refreshPreviewSharing = true
        } else if (actual === null) {
          // The regular preview builder activates undecorated output without
          // warming previewCache. readCurrentPreview verified this generation.
          previewStaging = join(snapshot.project, 'dist', '.preview-next')
          cpSync(join(root, 'dist/.preview/builds', preview.generation), previewStaging, { recursive: true })
          refreshPreviewSharing = true
        } else {
          previewStaging = atReleaseStage('engine_export', () => exportFrozenProfile(snapshot, toolchain, 'preview'))
          if (buildSnapshotIdentity(snapshot).snapshotId !== fingerprint) {
            throw new Error('Game release preview modified the frozen release inputs; retry preparation')
          }
        }
        previewExport = createExportReceipt(previewStaging, 'preview', fingerprint)
      }
    }
    preserveGeneratedImportMetadata(root, snapshot, { includeProvenance: false })
    if (!reusedRelease) {
      rmSync(cached, { recursive: true, force: true })
      cpSync(release, cached, { recursive: true })
      stampExportCache(cached, fingerprint)
    }
    if (previewStaging) {
      if (!refreshPreviewSharing) {
        rmSync(previewCache, { recursive: true, force: true })
        cpSync(previewStaging, previewCache, { recursive: true })
        stampExportCache(previewCache, fingerprint)
      }
      assembleShareSite(snapshot.project, previewStaging, sharing)
    }

    const state = readState(root)
    validateExportDirectory(snapshot.project, release)
    const wasmSha = fileSha256(join(release, 'index.wasm'))
    const pckSha = fileSha256(join(release, 'index.pck'))

    // An engine uploaded before brotli encoding is re-uploaded once so the
    // published site stops serving the uncompressed object.
    let wasmUrl = state.wasm_sha256 === wasmSha && state.wasm_url === `/manus-storage/game/sha256/${wasmSha.slice(7)}.wasm` &&
      state.wasm_content_encoding === WASM_CONTENT_ENCODING && state.wasm_encoded_sha256 === wasmSha ? state.wasm_url : null
    if (wasmUrl) {
      console.log(`[artifacts] engine wasm unchanged — reusing ${wasmUrl}`)
    } else {
      console.log('[artifacts] uploading engine wasm...')
      wasmUrl = atReleaseStage('upload_wasm', () => uploadToStorage(root, join(release, 'index.wasm')))
    }

    let pckUrl = state.pck_sha256 === pckSha && state.pck_url === `/manus-storage/game/sha256/${pckSha.slice(7)}.pck` ? state.pck_url : null
    if (pckUrl) {
      console.log(`[artifacts] pck unchanged — reusing ${pckUrl}`)
    } else {
      console.log('[artifacts] uploading game pck...')
      pckUrl = atReleaseStage('upload_pck', () => uploadToStorage(root, join(release, 'index.pck')))
    }

    const artifacts = {
      pck_url: pckUrl,
      wasm_url: wasmUrl,
      engine_version: toolchain.identity.engineVersion,
      source_fingerprint: fingerprint,
    }
    const staging = join(snapshot.project, 'dist', '.site-next')
    try {
      const siteBytes = atReleaseStage('assemble_site', () => assembleSite(snapshot.project, { 'index.wasm': wasmUrl, 'index.pck': pckUrl }, staging))
      assembleShareSite(snapshot.project, staging, sharing)
      const provenance = reconcileProvenance(snapshot.project)
      recordBuildProvenance(snapshot.project, exportedAssetEvidence(release, { profile: 'release', assets: provenance.assets, hostDirectory: staging }), { renderedCaptureRoot: root })
      const manifest = createReleaseManifest(snapshot.project, staging, { ...artifacts, build: { ...build, version: 2, profile: 'release', export: createExportReceipt(release, 'release', fingerprint) }, wasm_sha256: wasmSha, pck_sha256: pckSha })
      writeFileSync(join(staging, RELEASE_MANIFEST), JSON.stringify(manifest, null, 2) + '\n')
      atReleaseStage('verify_release', () => verifyRelease(snapshot.project, staging))
      renameSync(staging, join(snapshot.project, 'site'))
      // Install only generated output. A later source edit remains in the workspace.
      const delivery = join(root, 'dist', '.site-next')
      rmSync(delivery, { recursive: true, force: true })
      cpSync(join(snapshot.project, 'site'), delivery, { recursive: true })
      writeState(root, { ...artifacts, template_validation: templateValidation, wasm_sha256: wasmSha, wasm_content_encoding: WASM_CONTENT_ENCODING, wasm_encoded_sha256: wasmSha, pck_sha256: pckSha })
      const preparedPointer = join(snapshotsDirectory(root), 'prepared.json')
      const previousPrepared = existsSync(preparedPointer) ? readFileSync(preparedPointer) : null
      atReleaseStage('install_site', () => installSite(root, delivery, site => {
        verifyRelease(snapshot.project, site)
        if (previewStaging) activatePreview(root, previewStaging, fingerprint, { ...build, version: 2, profile: 'preview', export: previewExport })
        // Retain only frozen source and public site, not the export/import caches.
        rmSync(join(snapshot.project, 'dist'), { recursive: true, force: true })
        rmSync(join(snapshot.project, '.godot'), { recursive: true, force: true })
        recordPreparedSnapshot(root, snapshot)
      }, { pointers: ['dist/.snapshots/prepared.json', 'dist/.preview/current.json'] }))
      retained = true
      preserveGeneratedImportMetadata(root, snapshot)
      prunePreparedSnapshot(root, previousPrepared)
      console.log(`[artifacts] site/ assembled (${(siteBytes / 1024).toFixed(0)} KiB)`)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }

    return artifacts
  } finally { if (!retained) discardBuildSnapshot(snapshot) }
}
