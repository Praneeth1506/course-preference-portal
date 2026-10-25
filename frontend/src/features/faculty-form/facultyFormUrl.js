/**
 * Utility to extract public form token from browser location.
 *
 * Checks:
 * 1. URL search query (?token=... or ?form=...)
 * 2. Pathname (/forms/:token or /p/:token)
 * 3. Hash (#token=... or #/forms/...)
 *
 * @param {Location} [loc] - Optional window.location override
 * @returns {string} Extracted token or empty string
 */
export function extractTokenFromUrl(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) {
    return '';
  }

  // 1. Query parameters (?token=... or ?form=...)
  if (loc.search) {
    const params = new URLSearchParams(loc.search);
    const queryToken = params.get('token') || params.get('form');
    if (queryToken && queryToken.trim()) {
      return queryToken.trim();
    }
  }

  // 2. Pathname (/forms/:token or /p/:token or /public/forms/:token)
  if (loc.pathname) {
    const pathParts = loc.pathname.split('/').filter(Boolean);
    const formsIndex = pathParts.findIndex((part) => part === 'forms' || part === 'p' || part === 'public');
    if (formsIndex !== -1 && pathParts[formsIndex + 1]) {
      return decodeURIComponent(pathParts[formsIndex + 1].trim());
    }
  }

  // 3. Hash (#token=... or #/forms/...)
  if (loc.hash) {
    const hashClean = loc.hash.replace(/^#\/?/, '');
    const hashParams = new URLSearchParams(hashClean);
    const hashToken = hashParams.get('token');
    if (hashToken) return hashToken.trim();
    if (hashClean.startsWith('forms/')) {
      return hashClean.split('/')[1] || '';
    }
  }

  return '';
}
