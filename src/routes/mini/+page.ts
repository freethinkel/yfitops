// The app is an SPA, so no route has a file of its own — but the companion is
// opened by URL from Rust, and the asset protocol needs something to answer
// with. Prerendering just this shell puts a real mini.html in the bundle.
export const prerender = true;
