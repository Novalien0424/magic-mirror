# Local wake model packages

Each subdirectory is one immutable package created by
`scripts/import-wake-model.mjs`. Commit its `manifest.json` after evaluation;
large engine artifacts remain local and are copied into the packaged app from
this directory. Runtime activates only the single package referenced by the
published config and never falls back to another engine.
