# Plugin Packages

This folder contains reference plugin package layouts that can be moved into independent Git repositories.

## Included
- `example-wave-plugin`

## Suggested Separate-Repo Structure
1. `package.json`
2. `tsconfig.json`
3. `src/index.ts` exporting handshake
4. `README.md` with build/load instructions

## Host Compatibility
- Must implement handshake contract described in `docs/plugin-handshake.md`.
- Built output should provide a module path loadable by the host plugin loader.

