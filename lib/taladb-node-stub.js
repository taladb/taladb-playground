// Stub for the optional native `@taladb/node` addon. This app is browser-only:
// detectPlatform() resolves to 'browser', so taladb's createNodeDB() (the only
// caller of `import('@taladb/node')`) is never reached at runtime. Turbopack
// still needs the specifier to resolve at build time — this satisfies that
// without pulling in an uninstalled native binding.
export const TalaDbNode = undefined
export const TalaDBNode = undefined
export default {}
