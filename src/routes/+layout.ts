// One prerendered page, no server, no client-side router doing anything: the
// whole game is a canvas and a localStorage save, so there is nothing to render
// per-request and nothing to fetch.
export const prerender = true;
export const ssr = false;
