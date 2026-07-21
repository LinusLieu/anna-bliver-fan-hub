import React from 'react';
import { useSiteSettings } from '../context/SiteSettingsContext';

function Footer() {
  const { siteSettings } = useSiteSettings();
  const logo = <img src="/annapiggy-logo.png" alt="小猪anna的秘密基地" referrerPolicy="no-referrer" />;
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span>© 2026 <a href="https://github.com/LinusLieu" target="_blank" rel="noopener noreferrer">Linus_Lieu</a></span>
        <span className="site-footer-separator" aria-hidden="true">|</span>
        {siteSettings.bilibiliUid ? (
          <a className="site-footer-brand" href={`https://space.bilibili.com/${siteSettings.bilibiliUid}`} target="_blank" rel="noopener noreferrer">{logo}</a>
        ) : <span className="site-footer-brand">{logo}</span>}
      </div>
    </footer>
  );
}

export default Footer;
