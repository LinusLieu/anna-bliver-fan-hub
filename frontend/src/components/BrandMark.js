import React, { useEffect, useState } from 'react';
import { resolveSiteAssetUrl } from '../utils/siteAssets';

const BRAND_MODES = new Set(['image', 'text', 'icon-text']);

function BrandMark({ settings, className = '' }) {
  const mode = BRAND_MODES.has(settings.navbarBrandMode) ? settings.navbarBrandMode : 'image';
  const text = settings.navbarBrandText || settings.siteTitle;
  const imageUrl = resolveSiteAssetUrl(settings.navbarLogoUrl);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [imageUrl]);

  const showImage = mode !== 'text' && imageUrl && !imageFailed;
  const showText = mode !== 'image' || !showImage;

  return (
    <span className={`site-brand site-brand--${mode} ${className}`.trim()}>
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          className={`site-brand-image site-brand-image--${mode === 'icon-text' ? 'icon' : 'image'}`}
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      )}
      {showText && <span className="site-brand-text">{text}</span>}
    </span>
  );
}

export default BrandMark;
