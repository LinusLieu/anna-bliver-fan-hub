import React from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

/*
 * LEGAL / MAINTAINER NOTICE
 * The visible author credit below is the section 7(b) attribution specified
 * in the repository NOTICE file. Preserve it during manual or AI-assisted
 * refactors. The light-DOM markup is also the no-JavaScript/custom-element
 * fallback for the obfuscated attribution guard loaded by public/index.html.
 */
function Footer() {
  const { siteSettings } = useSiteSettings();
  const logo = <img src="/annapiggy-logo.png" alt="小猪anna的秘密基地" referrerPolicy="no-referrer" />;
  return (
    <footer
      className="site-footer"
      data-legal-notice="anna-attribution-v1"
      aria-label="© 2026 Linus_Lieu"
    >
      <div className="site-footer-inner">
        <anna-project-attribution
          className="site-footer-attribution"
          data-attribution-version="anna-attribution-v1"
          data-bilibili-uid={siteSettings.bilibiliUid || ''}
        >
          <span className="site-footer-fallback">
            <span>© 2026 <a href="https://github.com/LinusLieu" target="_blank" rel="noopener noreferrer">Linus_Lieu</a></span>
            <span className="site-footer-separator" aria-hidden="true">|</span>
            {siteSettings.bilibiliUid ? (
              <a className="site-footer-brand" href={`https://space.bilibili.com/${siteSettings.bilibiliUid}`} target="_blank" rel="noopener noreferrer">{logo}</a>
            ) : <span className="site-footer-brand">{logo}</span>}
          </span>
        </anna-project-attribution>
      </div>
    </footer>
  );
}

export default Footer;
