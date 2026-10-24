#!/usr/bin/env node
import { lstatSync, readFileSync } from 'node:fs'
import { syncAssets, tryAcquireExportLock, releaseExportLock } from './scripts/artifacts-lib.mjs'
import { StorageError } from './scripts/storage.mjs'
import { prepareThreejsAssets, ThreejsAssetPreparationError } from './scripts/prepare-threejs-assets.mjs'

import { restoreThreejsAssets, ThreejsAssetRestoreError, assetRestoreDiagnostic } from './scripts/threejs-asset-restore.mjs'

// Read-only probe for new UI/Server paired with an older device package.
if (process.argv.length === 3 && process.argv[2] === '--capabilities') {
  console.log(readFileSync(new URL('./asset-capabilities.json', import.meta.url), 'utf8').trim())
  process.exit(0)
}

let locked = false
try {
  if (process.argv.length > 3 || process.argv[2] !== undefined && process.argv[2] !== '--engine=threejs') throw Object.assign(new Error('Run sync-assets.mjs [--engine=threejs] from the game project directory.'), { code: 'invalid_arguments' })
  let project
  try { project = lstatSync('project.godot') } catch {}
  let engine = 'godot'
  if (process.argv[2] === '--engine=threejs' || !project?.isFile() || project.isSymbolicLink()) {
    let pkg
    try {
      const file = lstatSync('package.json')
      if (file.isFile() && !file.isSymbolicLink()) pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    } catch {}
    engine = pkg?.dependencies?.three || pkg?.devDependencies?.three ? 'threejs' : undefined
  }
  if (!engine) throw Object.assign(new Error('Run asset synchronization from the game project directory.'), { code: 'game_project_required' })
  locked = tryAcquireExportLock()
  if (!locked) throw Object.assign(new Error('Game asset synchronization is busy.'), { code: 'game_assets_busy' })
  const restored = engine === 'threejs' ? await restoreThreejsAssets(process.cwd()) : 0
  let summary
  syncAssets(process.cwd(), { engine, log: () => {}, onSummary: value => { summary = value } })
  if (engine === 'threejs') await prepareThreejsAssets(process.cwd(), { updateIndex: false })
  console.log(JSON.stringify({ ok: true, manifest: 'assets.lock.json', ...summary, restored: restored + (summary?.restored ?? 0) }))
} catch (error) {
  const known = error instanceof StorageError || error instanceof ThreejsAssetPreparationError || ['invalid_arguments', 'game_project_required', 'game_assets_busy'].includes(error?.code)
  console.error(JSON.stringify(error instanceof ThreejsAssetRestoreError ? { ok: false, ...assetRestoreDiagnostic(error) } : {
    ok: false,
    code: error instanceof ThreejsAssetPreparationError ? 'threejs_assets_preparation_failed' : known ? error.code : 'game_assets_sync_failed',
    message: known ? error.message : 'Game asset synchronization failed while validating or restoring project assets.',
    recovery: error instanceof StorageError ? error.recovery : error?.code === 'game_assets_busy'
      ? 'Retry after the active build or asset synchronization finishes.'
      : 'Check the game directory, asset paths, manifest, and storage configuration, then retry. Already recorded uploads are retained.',
    ...(error instanceof StorageError && error.httpStatus ? { httpStatus: error.httpStatus } : {}),
  }))
  process.exitCode = 1
} finally {
  if (locked) releaseExportLock()
}
