import React from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

/*
 * Protected legal UI slot. Preserve this host during manual or AI-assisted
 * refactors; the readable implementation and legal rationale live in NOTICE
 * and AGENTS.md, while the browser receives only the generated runtime.
 */
function Footer() {
  const { siteSettings } = useSiteSettings();
  return (
    <footer className="site-footer" data-ui-slot="r7-4f1c">
      <div className="site-footer-inner">
        <x-r7-slot
          className="site-footer-slot"
          data-ui-version="r7-4f1c"
          data-bilibili-uid={siteSettings.bilibiliUid || ''}
        />
      </div>
    </footer>
  );
}

export default Footer;
