// The demo is served from nl.tools, whose site root is this repo — crests are
// same-origin static files. Full club name, thumbs/ tier for lists, rose
// fallback wired by the caller (onerror=null guard, per canon).
export const ROSE_FALLBACK = '/assets/crests/National%20League%20rose.png';

const CREST_BASE = '/assets/crests/';

export function crestUrl(name, size) {
  const tier = size === 'thumb' ? 'thumbs/' : size === 'medium' ? 'medium/' : '';
  return CREST_BASE + tier + encodeURIComponent(name) + '.png';
}
