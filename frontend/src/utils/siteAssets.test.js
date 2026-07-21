import { resolveSiteAssetUrl } from './siteAssets';

describe('resolveSiteAssetUrl', () => {
  test('keeps public and remote assets unchanged', () => {
    expect(resolveSiteAssetUrl('/annapiggy-logo.png')).toBe('/annapiggy-logo.png');
    expect(resolveSiteAssetUrl('https://example.test/logo.png')).toBe('https://example.test/logo.png');
  });

  test('routes uploaded assets through the API origin', () => {
    expect(resolveSiteAssetUrl('/uploads/branding/logo.png')).toMatch(/^http:\/\/localhost:5000\/uploads\/branding\/logo\.png$/);
  });

  test('returns an empty value for an empty setting', () => {
    expect(resolveSiteAssetUrl('')).toBe('');
  });
});
