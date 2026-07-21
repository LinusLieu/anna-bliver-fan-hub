import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bilibiliService } from '../services';
import { useSiteSettings } from '../context/SiteSettingsContext';

const featureIcons = { playlists: '♪', marshmallows: '✉', prizes: '★' };

function Home() {
  const { siteSettings } = useSiteSettings();
  const [biliInfo, setBiliInfo] = useState(null);

  useEffect(() => {
    if (!siteSettings.bilibiliUid) {
      setBiliInfo(null);
      return;
    }
    bilibiliService.getInfo().then(setBiliInfo).catch(() => setBiliInfo(null));
  }, [siteSettings.bilibiliUid]);

  const features = [
    { key: 'playlists', to: '/playlists', title: siteSettings.playlistCardTitle, description: siteSettings.playlistCardDescription },
    { key: 'marshmallows', to: '/marshmallows', title: siteSettings.marshmallowCardTitle, description: siteSettings.marshmallowCardDescription },
    { key: 'prizes', to: '/prizes', title: siteSettings.prizeCardTitle, description: siteSettings.prizeCardDescription }
  ];

  return (
    <div className="container home-page">
      <section className="home-intro">
        {biliInfo && <a className="bili-profile-link" href={`https://space.bilibili.com/${biliInfo.mid}`} target="_blank" rel="noopener noreferrer">
          <div className="bili-profile-card">
            <div className="bili-avatar-wrapper"><img src={biliInfo.face} alt={biliInfo.name} className="bili-avatar" referrerPolicy="no-referrer" /></div>
            <div className="bili-info-content">
              <div className="bili-username-row"><span className="bili-username">{biliInfo.name}</span><span className="bili-badge">UP主</span></div>
              <div className="bili-stats-row">
                <div className="bili-stat-item"><span className="bili-stat-value">{biliInfo.archive_count}</span><span className="bili-stat-label">投稿</span></div>
                <div className="bili-stat-item"><span className="bili-stat-value">{biliInfo.fans}</span><span className="bili-stat-label">粉丝</span></div>
                <div className="bili-stat-item"><span className="bili-stat-value">{biliInfo.likes}</span><span className="bili-stat-label">获赞</span></div>
              </div>
            </div>
          </div>
        </a>}
        <h1 className="page-title">{siteSettings.homeTitle}</h1>
        <p className="page-subtitle">{biliInfo?.sign || siteSettings.homeSubtitle}</p>
      </section>
      <section className="home-feature-grid" aria-label="主要功能">
        {features.map((feature) => <Link key={feature.key} to={feature.to} className="home-feature-link">
          <article className="card home-feature-card">
            <span className="home-feature-icon" aria-hidden="true">{featureIcons[feature.key]}</span>
            <h2 className="card-title">{feature.title}</h2>
            <p className="card-description">{feature.description}</p>
          </article>
        </Link>)}
      </section>
    </div>
  );
}

export default Home;
