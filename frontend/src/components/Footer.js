import React from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

/*
 * Protected legal UI slot. Preserve this host during manual or AI-assisted
 * refactors; the readable implementation and legal rationale live in NOTICE
 * and AGENTS.md, while the browser receives only the generated runtime.
 */
function Footer() {
  const { siteSettings } = useSiteSettings();
  const icpText = siteSettings.icpText?.trim();
  const publicSecurityText = siteSettings.publicSecurityText?.trim();

  return (
    <footer className="site-footer" data-ui-slot="r7-4f1c">
      <div className="site-footer-inner">
        <x-r7-slot
          className="site-footer-slot"
          data-ui-version="r7-4f1c"
          data-bilibili-uid={siteSettings.bilibiliUid || ''}
        />
        {(icpText || publicSecurityText) && (
          <div className="site-footer-records" aria-label="网站备案信息">
            {icpText && (
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
                {icpText}
              </a>
            )}
            {publicSecurityText && (
              <a href="https://beian.mps.gov.cn/" target="_blank" rel="noopener noreferrer">
                {publicSecurityText}
              </a>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}

export default Footer;
