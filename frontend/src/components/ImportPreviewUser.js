import React from 'react';

export default function ImportPreviewUser({ row }) {
  const item = row || {};
  return (
    <div className="import-preview-user">
      {item.bilibili_face && <img src={item.bilibili_face} alt="" referrerPolicy="no-referrer" />}
      <div><strong>{item.bilibili_uname || `UID ${item.bilibili_uid}`}</strong><span>UID {item.bilibili_uid}</span></div>
      <span>{Number(item.points || 0) > 0 ? '+' : ''}{item.points || 0} 积分</span>
    </div>
  );
}
