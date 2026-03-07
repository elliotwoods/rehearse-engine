# Beam Crossover Plugin

Volumetric beam plugin for Simularca.

## Included actors
- `Beam Emitter`
- `Beam Emitter Array`

## Build
```bash
npm run build
```

## Load
- Auto-discovery after build from `plugins/beam-crossover-plugin/dist/index.js`
- Or manually from the Simularca console:
  - `plugin.load("file:///ABSOLUTE_PATH_TO_PLUGIN/dist/index.js")`

## Notes
- `Beam Emitter Array` uses `Emitter Curve` world positions and intentionally ignores its own actor transform when placing beam origins.
- `Beam Type` is currently `solid`, but the internal structure keeps the material path switchable for future beam modes.
