// `fake-indexeddb` ships types for its `/auto` entry point but does not map
// them through its package `exports`, so TypeScript cannot resolve them under
// `moduleResolution: bundler`. The module has no exports - importing it for
// its side effect (installing the IDB* globals) is the entire API.
declare module 'fake-indexeddb/auto';
