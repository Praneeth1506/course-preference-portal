import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTokenFromUrl } from './facultyFormUrl.js';

describe('URL Token Extraction', () => {
  it('extracts token from search query parameter (?token=...)', () => {
    const loc = { search: '?token=token-from-query', pathname: '/', hash: '' };
    assert.equal(extractTokenFromUrl(loc), 'token-from-query');
  });

  it('extracts token from alternate query parameter (?form=...)', () => {
    const loc = { search: '?form=token-from-form-param', pathname: '/', hash: '' };
    assert.equal(extractTokenFromUrl(loc), 'token-from-form-param');
  });

  it('extracts token from pathname (/forms/:token)', () => {
    const loc = { search: '', pathname: '/forms/cs-spring-2026', hash: '' };
    assert.equal(extractTokenFromUrl(loc), 'cs-spring-2026');
  });

  it('extracts token from short pathname (/p/:token)', () => {
    const loc = { search: '', pathname: '/p/fall-2026-portal', hash: '' };
    assert.equal(extractTokenFromUrl(loc), 'fall-2026-portal');
  });

  it('extracts token from hash (#token=...)', () => {
    const loc = { search: '', pathname: '/', hash: '#token=hash-tok-99' };
    assert.equal(extractTokenFromUrl(loc), 'hash-tok-99');
  });

  it('extracts token from hash route (#/forms/:token)', () => {
    const loc = { search: '', pathname: '/', hash: '#/forms/hash-route-tok' };
    assert.equal(extractTokenFromUrl(loc), 'hash-route-tok');
  });

  it('returns empty string when no token is present', () => {
    const loc = { search: '', pathname: '/', hash: '' };
    assert.equal(extractTokenFromUrl(loc), '');
    assert.equal(extractTokenFromUrl(null), '');
  });
});
