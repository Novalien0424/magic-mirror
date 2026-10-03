import { app } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PASS_MARKER =
  'SQLITE_RUNTIME_RESULT status=passed;open=ready;wal=wal;close=closed;reopen=ready;row=present;close_again=closed'

let finalizing = false
let temporaryDirectory
const openDatabases = new Set()

function report(status) {
  process.stdout.write(`SQLITE_RUNTIME_RESULT ${status}\n`)
}

function closeOpenDatabases() {
  let closeFailed = false

  for (const database of openDatabases) {
    try {
      database.close()
      openDatabases.delete(database)
    } catch {
      closeFailed = true
    }
  }

  return closeFailed
}

async function removeTemporaryDirectory() {
  if (temporaryDirectory === undefined) {
    return false
  }

  try {
    await rm(temporaryDirectory, { force: true, recursive: true })
    temporaryDirectory = undefined
    return false
  } catch {
    return true
  }
}

async function finishFailure(reason) {
  if (finalizing) {
    return
  }
  finalizing = true

  const closeFailed = closeOpenDatabases()
  const cleanupFailed = await removeTemporaryDirectory()
  report(closeFailed || cleanupFailed ? 'status=failed;reason=cleanup_failed' : `status=failed;reason=${reason}`)
  app.exit(1)
}

async function finishSuccess() {
  if (finalizing) {
    return
  }
  finalizing = true

  const closeFailed = closeOpenDatabases()
  const cleanupFailed = await removeTemporaryDirectory()
  if (closeFailed || cleanupFailed) {
    report('status=failed;reason=cleanup_failed')
    app.exit(1)
    return
  }

  report(PASS_MARKER.slice('SQLITE_RUNTIME_RESULT '.length))
  app.exit(0)
}

async function runSmoke() {
  try {
    await app.whenReady()
  } catch {
    await finishFailure('app_ready_failed')
    return
  }

  if (!app.isReady()) {
    await finishFailure('app_not_ready')
    return
  }

  let DatabaseSync
  try {
    const sqlite = await import('node:sqlite')
    DatabaseSync = sqlite.DatabaseSync
    if (typeof DatabaseSync !== 'function') {
      await finishFailure('sqlite_unavailable')
      return
    }
  } catch {
    await finishFailure('sqlite_unavailable')
    return
  }

  let databasePath
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'magic-mirror-sqlite-smoke-'))
    databasePath = join(temporaryDirectory, 'runtime-smoke.sqlite')
  } catch {
    await finishFailure('temp_directory_failed')
    return
  }

  let database
  try {
    database = new DatabaseSync(databasePath)
    openDatabases.add(database)
  } catch {
    await finishFailure('open_failed')
    return
  }

  try {
    database.exec('PRAGMA journal_mode = WAL')
    const journalMode = database.prepare('PRAGMA journal_mode').get()
    if (journalMode?.journal_mode !== 'wal') {
      await finishFailure('wal_mismatch')
      return
    }
  } catch {
    await finishFailure('wal_mismatch')
    return
  }

  try {
    database.exec(
      'CREATE TABLE runtime_smoke_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    )
    database
      .prepare('INSERT INTO runtime_smoke_metadata (key, value) VALUES (?, ?)')
      .run('sentinel', 'present')
  } catch {
    await finishFailure('write_failed')
    return
  }

  try {
    database.close()
    openDatabases.delete(database)
  } catch {
    await finishFailure('close_failed')
    return
  }

  let reopenedDatabase
  try {
    reopenedDatabase = new DatabaseSync(databasePath)
    openDatabases.add(reopenedDatabase)
  } catch {
    await finishFailure('reopen_failed')
    return
  }

  try {
    const sentinel = reopenedDatabase
      .prepare(
        'SELECT 1 AS present FROM runtime_smoke_metadata WHERE key = ? LIMIT 1',
      )
      .get('sentinel')
    if (sentinel?.present !== 1) {
      await finishFailure('read_mismatch')
      return
    }
  } catch {
    await finishFailure('read_mismatch')
    return
  }

  try {
    reopenedDatabase.close()
    openDatabases.delete(reopenedDatabase)
  } catch {
    await finishFailure('close_again_failed')
    return
  }

  await finishSuccess()
}

process.on('uncaughtException', () => {
  void finishFailure('uncaught_exception')
})

process.on('unhandledRejection', () => {
  void finishFailure('unhandled_rejection')
})

void runSmoke().catch(() => {
  void finishFailure('uncaught_exception')
})
