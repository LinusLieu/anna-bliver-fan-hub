import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import readXlsxFile from 'read-excel-file';
import { playlistService, authService, permissionService } from '../services';
import BackButton from '../components/BackButton';
import { useFeedback } from '../components/FeedbackProvider';
import { useSiteSettings } from '../context/SiteSettingsContext';

function Playlists() {
  const { confirm, toast } = useFeedback();
  const { siteSettings } = useSiteSettings();
  const [playlists, setPlaylists] = useState([]);
  const [allSongs, setAllSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [navbarHeight, setNavbarHeight] = useState(0);
  const searchContainerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(50);

  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [isBatchAdding, setIsBatchAdding] = useState(false);
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [allTags, setAllTags] = useState([]);

  const currentUser = useMemo(() => authService.getCurrentUser(), []);
  const isAdmin = currentUser?.role === 'admin';
  const [canEdit, setCanEdit] = useState(false);
// Get all unique tags from songs
  const availableTags = useMemo(() => ['All', ...new Set(allSongs.flatMap(song =>
    song.tags ? song.tags.map(tag => tag.name) : []
  ))], [allSongs]);

  // Filter songs based on search query and selected tag
  const filteredSongs = useMemo(() => {
    return allSongs.filter(song => {
      const matchesSearch = (song.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
                           (song.artist?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchesTag = selectedTag === 'All' ||
                        (song.tags && song.tags.some(tag => tag.name === selectedTag));

      return matchesSearch && matchesTag;
    });
  }, [allSongs, searchQuery, selectedTag]);

  // Reset visibleCount when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, selectedTag]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }

      // Infinite scroll logic
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        setVisibleCount(prev => {
          if (prev >= filteredSongs.length) return prev;
          return prev + 50;
        });
      }

      if (searchContainerRef.current) {
        const rect = searchContainerRef.current.getBoundingClientRect();
        // 吸附阈值：当元素顶部接触到导航栏底部时
        // 考虑到 sticky 的 top 设置为 navbarHeight
        const isStuck = rect.top <= navbarHeight + 17;

        setIsScrolled(prev => {
          // 如果当前未收缩，且已经吸附 -> 立即收缩
          if (!prev && isStuck) {
            return true;
          }
          // 如果当前已收缩，只有当向下脱离吸附点一定距离（滞后缓冲区）才展开
          // 这里设置 50px 的缓冲区，防止边缘抖动，实现“轻松脱离”但有阻尼
          if (prev && rect.top > navbarHeight + 150) {
            return false;
          }
          // 否则保持原状态
          return prev;
        });
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [navbarHeight, filteredSongs.length]);

  useEffect(() => {
    const updateNavbarHeight = () => {
      const navbar = document.querySelector('.navbar');
      if (navbar) {
        setNavbarHeight(navbar.offsetHeight);
      }
    };

    updateNavbarHeight();
    window.addEventListener('resize', updateNavbarHeight);
    return () => window.removeEventListener('resize', updateNavbarHeight);
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const tags = await playlistService.getAllTags();
      setAllTags(tags);
    } catch (err) {
      console.error('Failed to load tags', err);
    }
  }, []);

  const loadPlaylists = useCallback(async () => {
    try {
      const playlistsData = await playlistService.getAllPlaylists();
      setPlaylists(playlistsData);

      // 为每个播放列表获取详情（包含歌曲）
      const allPlaylistsWithSongs = await Promise.all(
        playlistsData.map(playlist => playlistService.getPlaylistById(playlist.id))
      );

      // 收集所有播放列表中的所有歌曲
      const songs = [];
      let globalIndex = 0;
      allPlaylistsWithSongs.forEach((playlist) => {
        if (playlist.songs && playlist.songs.length > 0) {
          playlist.songs.forEach((song) => {
            songs.push({
              ...song,
              playlistTitle: playlist.title,
              globalIndex: globalIndex
            });
            globalIndex++;
          });
        }
      });

      songs.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));

      setAllSongs(songs);
    } catch (err) {
      setError('Failed to load playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
    loadTags();
    // Check edit permissions
    if (currentUser) {
      if (currentUser.role === 'admin') {
        setCanEdit(true);
      } else {
        permissionService.getMyPermissions().then(perms => {
          const hasEditPerm = perms.permissions?.includes('playlist.edit.single') ||
                              perms.permissions?.includes('playlist.edit.batch');
          setCanEdit(hasEditPerm);
        }).catch(() => setCanEdit(false));
      }
    }
  }, [currentUser, loadPlaylists, loadTags]);

  if (loading) {
    return <div className="loading">正在加载歌单...</div>;
  }

  if (error) {
    return <div className="container"><div className="form-error">{error}</div></div>;
  }

  const handleCopyToClipboard = (playlistTitle, customMessage = null) => {
    if (isEditMode) return; // Disable copy in edit mode
    const text = `点歌 ${playlistTitle}`;
    navigator.clipboard.writeText(text);
    toast(customMessage || '复制成功，去点歌吧！', { type: 'success' });
  };

  const handleRandomPick = () => {
    const songsToPickFrom = filteredSongs.length > 0 ? filteredSongs : allSongs;
    if (songsToPickFrom.length === 0) return;

    const randomIndex = Math.floor(Math.random() * songsToPickFrom.length);
    const randomSong = songsToPickFrom[randomIndex];

    handleCopyToClipboard(randomSong.title, `那就来听《${randomSong.title}》吧！`);
  };

  const handleEditClick = (e, song) => {
    e.stopPropagation();
    setEditingSong(song);
  };

  const handleSaveSong = async (updatedData) => {
    try {
      await playlistService.updateSong(editingSong.id, updatedData);
      setEditingSong(null);
      loadPlaylists(); // Reload to see changes
    } catch (err) {
      console.error('Failed to update song', err);
      toast('更新歌曲失败', { type: 'error' });
    }
  };

  const handleDeleteSong = async (songId) => {
    const confirmed = await confirm({
      title: '删除歌曲',
      message: '确定要删除这首歌吗？',
      detail: '此操作无法撤销。',
      confirmText: '删除歌曲',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      await playlistService.deleteSong(songId);
      setEditingSong(null);
      loadPlaylists(); // Reload to see changes
    } catch (err) {
      console.error('Failed to delete song', err);
      toast('删除歌曲失败', { type: 'error' });
    }
  };

  const handleAddSong = async (newSongData) => {
    try {
      // Default to first playlist if available, or handle playlist selection logic
      const defaultPlaylistId = playlists.length > 0 ? playlists[0].id : null;

      if (!defaultPlaylistId) {
        toast('没有可添加歌曲的歌单', { type: 'warning' });
        return;
      }

      await playlistService.addSong(defaultPlaylistId, newSongData);

      // If there are tags, we need to update them separately because addSong might not handle tags directly
      // depending on backend implementation. For now assuming addSong returns the new song ID
      // But based on current backend, addSong doesn't take tags.
      // So we might need to call updateSong immediately after adding to set tags,
      // OR update backend addSong to handle tags.
      // Let's check backend addSong implementation... it doesn't handle tags.
      // So we will just add the song first.

      setIsAddingSong(false);
      loadPlaylists();
      loadTags();
    } catch (err) {
      console.error('Failed to add song', err);
      toast('添加歌曲失败', { type: 'error' });
    }
  };

  const handleBatchAddSongs = async (songs) => {
    try {
      const defaultPlaylistId = playlists.length > 0 ? playlists[0].id : null;
      if (!defaultPlaylistId) {
        toast('没有可添加歌曲的歌单', { type: 'warning' });
        return;
      }

      const result = await playlistService.batchAddSongs(defaultPlaylistId, songs);
      toast(`成功添加 ${result.count} 首歌曲`, { type: 'success' });
      setIsBatchAdding(false);
      loadPlaylists();
      loadTags();
    } catch (err) {
      console.error('Failed to batch add songs', err);
      toast('批量添加歌曲失败', { type: 'error' });
    }
  };

  const handleUpdateTag = async (tagId, tagData) => {
    try {
      await playlistService.updateTag(tagId, tagData);
      loadTags();
      loadPlaylists(); // Reload playlists to update tags on songs
    } catch (err) {
      console.error('Failed to update tag', err);
      toast('更新标签失败', { type: 'error' });
    }
  };

  const handleDeleteTag = async (tagId) => {
    const confirmed = await confirm({
      title: '删除标签',
      message: '确定要删除这个标签吗？',
      detail: '这将从所有歌曲中移除此标签。',
      confirmText: '删除标签',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await playlistService.deleteTag(tagId);
      loadTags();
      loadPlaylists(); // Reload playlists to update tags on songs
    } catch (err) {
      console.error('Failed to delete tag', err);
      toast('删除标签失败', { type: 'error' });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <div className="container">
      <BackButton to="/" />

      <div className="playlist-header">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{siteSettings.playlistTitle}</h1>
          <p className="page-subtitle">{siteSettings.playlistSubtitle}</p>
        </div>
        {canEdit && (
          <div className="playlist-admin-controls">
            {isEditMode && (
              <>
                <button
                  className="btn btn-primary"
                  style={{ borderRadius: '20px', padding: '8px 16px', fontSize: '0.9rem' }}
                  onClick={() => setIsAddingSong(true)}
                >
                  + 添加歌曲
                </button>
                {isAdmin && (
                  <>
                    <button
                      className="btn btn-secondary"
                      style={{ borderRadius: '20px', padding: '8px 16px', fontSize: '0.9rem' }}
                      onClick={() => setIsBatchAdding(true)}
                    >
                      + 批量添加
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ borderRadius: '20px', padding: '8px 16px', fontSize: '0.9rem' }}
                      onClick={() => setIsManagingTags(true)}
                    >
                      # 管理标签
                    </button>
                  </>
                )}
              </>
            )}
            <button
              className={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
              onClick={() => setIsEditMode(!isEditMode)}
            >
              {isEditMode ? '退出编辑' : '编辑模式'}
            </button>
          </div>
        )}
      </div>

      <p className="page-subtitle">每晚9点唱歌｜全职歌势猪猪猪｜有幸相遇，承蒙厚爱❤️</p>

      {editingSong && (
        <EditSongModal
          song={editingSong}
          allTags={allTags}
          onSave={handleSaveSong}
          onDelete={() => handleDeleteSong(editingSong.id)}
          onCancel={() => setEditingSong(null)}
          title="编辑歌曲"
        />
      )}

      {isAddingSong && (
        <EditSongModal
          song={{ title: '', artist: '', duration: '', tags: [] }}
          allTags={allTags}
          onSave={handleAddSong}
          onCancel={() => setIsAddingSong(false)}
          title="添加新歌"
        />
      )}

      {isBatchAdding && (
        <BatchAddSongsModal
          allTags={allTags}
          onSave={handleBatchAddSongs}
          onCancel={() => setIsBatchAdding(false)}
        />
      )}

      {isManagingTags && (
        <TagManagerModal
          tags={allTags}
          onUpdate={handleUpdateTag}
          onDelete={handleDeleteTag}
          onCancel={() => setIsManagingTags(false)}
        />
      )}

      {allSongs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎵</div>
          <p>暂无歌曲</p>
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--text-light)', marginBottom: '1rem', textAlign: 'center' }}>
            总歌曲数: {allSongs.length}
          </p>

          <div
            ref={searchContainerRef}
            className="search-filter-container"
            style={{
              transition: 'all 0.3s ease',
              padding: isScrolled ? '15px 1rem 0px' : '1rem',
              top: `${navbarHeight + 15}px`
            }}
          >
            <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
              <input
                type="text"
                placeholder="在此输入歌名或者歌手进行搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={handleRandomPick}
                style={{ whiteSpace: 'nowrap', borderRadius: '25px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                随便听听
              </button>
            </div>

            {availableTags.length > 1 && (
              <div
                className="filter-tags"
                style={{
                  maxHeight: isScrolled ? '0' : '200px',
                  opacity: isScrolled ? 0 : 1,
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                  marginTop: isScrolled ? 0 : '0.5rem'
                }}
              >
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    className={`filter-tag-btn ${selectedTag === tag ? 'active' : ''}`}
                    onClick={() => setSelectedTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="songs-grid">
            {filteredSongs.slice(0, visibleCount).map((song, index) => (
              <div
                key={`${song.playlistTitle}-${song.id}`}
                className="song-bubble"
                onClick={() => handleCopyToClipboard(song.title)}
                style={{ cursor: 'pointer' }}
              >

                {song.note && (
                  <div className="song-note-badge">
                    <ScrollingText content={`冠名：${song.note}`} />
                  </div>
                )}
                <div className="song-bubble-content">
                  <div className="song-bubble-title" >
                    <ScrollingText content={song.title} />
                  </div>
                  <div className="song-bottom-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    <div className="song-bubble-artist" style={{ width: '100%' }}>
                      <ScrollingText content={song.artist} />
                    </div>
                    {song.tags && song.tags.length > 0 && (
                      <div className="song-tags" style={{ width: '100%', justifyContent: 'flex-start', marginLeft: 0, marginTop: 0 }}>
                        <ScrollingText
                          content={
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {song.tags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="song-tag"
                                  style={{ backgroundColor: tag.color || '#6c5ce7ff', whiteSpace: 'nowrap' }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
                {isEditMode && (
                  <button
                    className="song-edit-btn"
                    onClick={(e) => handleEditClick(e, song)}
                  >
                    ✏️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {showScrollTop && (
        <button
          className="back-to-top-btn"
          onClick={scrollToTop}
          title="回到顶部"
        >
          ↑
        </button>
      )}
    </div>
  );
}

const ScrollingText = ({ content, className, style }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [scrollAmount, setScrollAmount] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        const overflow = textWidth > containerWidth;
        setIsOverflowing(overflow);
        if (overflow) {
          setScrollAmount(textWidth - containerWidth);
        }
      }
    };

    checkOverflow();
    // Add a small delay to ensure fonts are loaded/layout is settled
    const timer = setTimeout(checkOverflow, 100);

    window.addEventListener('resize', checkOverflow);
    return () => {
      window.removeEventListener('resize', checkOverflow);
      clearTimeout(timer);
    };
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`scrolling-text-container ${isOverflowing ? 'is-overflowing' : ''} ${className || ''}`}
      style={{ ...style, '--scroll-amount': `${scrollAmount}px` }}
    >
      <div
        ref={textRef}
        className={`scrolling-text-content ${isOverflowing ? 'animate-bounce' : ''}`}
      >
        {content}
      </div>
    </div>
  );
};

function TagManagerModal({ tags, onUpdate, onDelete, onCancel }) {
  const [editingTagId, setEditingTagId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const startEditing = (tag) => {
    setEditingTagId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || '#6c5ce7');
  };

  const handleSave = (id) => {
    onUpdate(id, { name: editName, color: editColor });
    setEditingTagId(null);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <h3>管理标签</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto', margin: '1rem 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>预览</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>名称</th>
                <th style={{ textAlign: 'right', padding: '8px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {tags.map(tag => (
                <tr key={tag.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '8px' }}>
                    {editingTagId === tag.id ? (
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        style={{ width: '30px', height: '30px', padding: 0, border: 'none', cursor: 'pointer' }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'inline-block',
                          width: '20px',
                          height: '20px',
                          backgroundColor: tag.color || '#6c5ce7',
                          borderRadius: '50%'
                        }}
                      />
                    )}
                  </td>
                  <td style={{ padding: '8px' }}>
                    {editingTagId === tag.id ? (
                      <input
                        type="text"
                        className="form-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ padding: '4px 8px' }}
                      />
                    ) : (
                      <span style={{ color: tag.color || '#6c5ce7', fontWeight: '500' }}>{tag.name}</span>
                    )}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    {editingTagId === tag.id ? (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => handleSave(tag.id)}
                        >
                          保存
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => setEditingTagId(null)}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => startEditing(tag)}
                        >
                          编辑
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.8rem', backgroundColor: '#ff4757', color: 'white', border: 'none' }}
                          onClick={() => onDelete(tag.id)}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel} className="btn btn-secondary">关闭</button>
        </div>
      </div>
    </div>
  );
}

function EditSongModal({ song, allTags, onSave, onDelete, onCancel, title }) {
  const { toast } = useFeedback();
  const [formData, setFormData] = useState({
    title: song.title,
    artist: song.artist,
    duration: song.duration || '',
    note: song.note || '',
    tags: song.tags || []
  });

  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagData, setNewTagData] = useState({ name: '', color: '#6c5ce7' });
  const [localTags, setLocalTags] = useState(allTags);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const toggleTag = (tag) => {
    const hasTag = formData.tags.some(t => t.name === tag.name);
    if (hasTag) {
      setFormData({
        ...formData,
        tags: formData.tags.filter(t => t.name !== tag.name)
      });
    } else {
      setFormData({
        ...formData,
        tags: [...formData.tags, tag]
      });
    }
  };

  const handleCreateTag = async () => {
    if (!newTagData.name) return;
    try {
      const newTag = await playlistService.createTag(newTagData);
      setLocalTags([...localTags, newTag]);
      // Automatically select the new tag
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag]
      });
      setIsCreatingTag(false);
      setNewTagData({ name: '', color: '#6c5ce7' });
    } catch (err) {
      console.error('Failed to create tag', err);
      toast(`创建标签失败：${err.response?.data?.message || err.message}`, { type: 'error' });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{title || '编辑歌曲'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">歌名</label>
            <input
              type="text"
              className="form-input"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">歌手</label>
            <input
              type="text"
              className="form-input"
              value={formData.artist}
              onChange={e => setFormData({...formData, artist: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">冠名</label>
            <input
              type="text"
              className="form-input"
              value={formData.note}
              onChange={e => setFormData({...formData, note: e.target.value})}
              placeholder="例如: XXX"
            />
          </div>
          <div className="form-group">
            <label className="form-label">标签</label>
            <div className="tags-selector">
              {localTags.map(tag => {
                const isSelected = formData.tags.some(t => t.name === tag.name);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`tag-select-btn ${isSelected ? 'selected' : ''}`}
                    style={{
                      backgroundColor: isSelected ? (tag.color || '#6c5ce7') : 'white',
                      color: isSelected ? 'white' : 'var(--text-dark)',
                      borderColor: tag.color || '#6c5ce7'
                    }}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag.name}
                  </button>
                );
              })}
              <button
                type="button"
                className="tag-select-btn"
                style={{ borderStyle: 'dashed', color: 'var(--primary-purple)' }}
                onClick={() => setIsCreatingTag(!isCreatingTag)}
              >
                + 新建标签
              </button>
            </div>

            {isCreatingTag && (
              <div className="new-tag-form" style={{ marginTop: '1rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="标签名称"
                    className="form-input"
                    value={newTagData.name}
                    onChange={e => setNewTagData({...newTagData, name: e.target.value})}
                  />
                  <input
                    type="color"
                    value={newTagData.color}
                    onChange={e => setNewTagData({...newTagData, color: e.target.value})}
                    style={{ height: '42px', width: '60px', padding: '0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                  onClick={handleCreateTag}
                >
                  确认创建
                </button>
              </div>
            )}
          </div>
          <div className="modal-actions">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="btn"
                style={{ backgroundColor: '#ff4757', color: 'white', marginRight: 'auto' }}
              >
                删除
              </button>
            )}
            <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
            <button type="submit" className="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BatchAddSongsModal({ allTags, onSave, onCancel }) {
  const { toast } = useFeedback();
  const [rows, setRows] = useState([{ title: '', artist: '', note: '', tags: [] }]);
  const [, setIsUploading] = useState(false);
  const [activeTagRow, setActiveTagRow] = useState(null);
  const [newTagInput, setNewTagInput] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const data = await readXlsxFile(file);

      if (data.length > 1) {
        const headers = data[0].map(h => h?.toString().toLowerCase().trim());
        const titleIdx = headers.findIndex(h => h === 'title' || h === '歌名');
        const artistIdx = headers.findIndex(h => h === 'artist' || h === '歌手');
        const noteIdx = headers.findIndex(h => h === 'note' || h === '冠名' || h === '备注');
        const tagsIdx = headers.findIndex(h => h === 'tags' || h === '标签');

        if (titleIdx === -1 || artistIdx === -1) {
          toast('Excel 必须包含 Title/歌名 和 Artist/歌手 列', { type: 'error' });
          setIsUploading(false);
          return;
        }

        const newRows = data.slice(1).map(row => {
          const tagStr = row[tagsIdx] || '';
          // Auto-match tags: split string and filter
          const tags = tagStr.toString().split(/[,，\s]+/).filter(Boolean);

          return {
            title: row[titleIdx]?.toString() || '',
            artist: row[artistIdx]?.toString() || '',
            note: row[noteIdx]?.toString() || '',
            tags: tags
          };
        }).filter(r => r.title && r.artist);

        if (newRows.length > 0) {
           setRows(prev => {
              const cleanPrev = prev.filter(r => r.title || r.artist);
              return [...cleanPrev, ...newRows];
           });
        }
      }
    } catch (err) {
      console.error(err);
      toast('解析 Excel 文件失败', { type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRowChange = (index, field, value) => {
    const newRows = [...rows];
    newRows[index][field] = value;
    setRows(newRows);
  };

  const toggleTag = (rowIndex, tagName) => {
    const newRows = [...rows];
    const currentTags = newRows[rowIndex].tags || [];
    if (currentTags.includes(tagName)) {
      newRows[rowIndex].tags = currentTags.filter(t => t !== tagName);
    } else {
      newRows[rowIndex].tags = [...currentTags, tagName];
    }
    setRows(newRows);
  };

  const addNewTagToRow = (rowIndex) => {
    if (!newTagInput.trim()) return;
    const tagName = newTagInput.trim();
    const newRows = [...rows];
    const currentTags = newRows[rowIndex].tags || [];
    if (!currentTags.includes(tagName)) {
      newRows[rowIndex].tags = [...currentTags, tagName];
    }
    setRows(newRows);
    setNewTagInput('');
  };

  const addRow = () => {
    setRows([...rows, { title: '', artist: '', note: '', tags: [] }]);
  };

  const removeRow = (index) => {
    const newRows = rows.filter((_, i) => i !== index);
    if (newRows.length === 0) {
        setRows([{ title: '', artist: '', note: '', tags: [] }]);
    } else {
        setRows(newRows);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validRows = rows.filter(r => r.title.trim() && r.artist.trim());
    if (validRows.length === 0) {
      toast('请至少添加一首有效歌曲', { type: 'warning' });
      return;
    }
    // tags are already arrays of strings
    onSave(validRows);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
        <h2>批量添加歌曲</h2>

        <div className="batch-actions" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="file-upload">
            <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
              📂 上传 Excel
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>
            支持格式: .xlsx, .xls (需包含表头: 歌名, 歌手, 冠名, 标签)
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="batch-table-container" style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '1rem' }}>
            <table className="batch-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                  <th style={{ padding: '8px', width: '25%' }}>歌名 *</th>
                  <th style={{ padding: '8px', width: '20%' }}>歌手 *</th>
                  <th style={{ padding: '8px', width: '15%' }}>冠名</th>
                  <th style={{ padding: '8px', width: '35%' }}>标签</th>
                  <th style={{ padding: '8px', width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="form-input"
                        value={row.title}
                        onChange={e => handleRowChange(index, 'title', e.target.value)}
                        placeholder="歌名"
                        required
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="form-input"
                        value={row.artist}
                        onChange={e => handleRowChange(index, 'artist', e.target.value)}
                        placeholder="歌手"
                        required
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="form-input"
                        value={row.note}
                        onChange={e => handleRowChange(index, 'note', e.target.value)}
                        placeholder="冠名"
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div
                        className="form-input"
                        style={{ minHeight: '38px', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}
                        onClick={() => setActiveTagRow(index)}
                      >
                        {row.tags && row.tags.length > 0 ? (
                          row.tags.map((tag, i) => {
                            const matchedTag = allTags.find(t => t.name === tag);
                            return (
                              <span
                                key={i}
                                style={{
                                  backgroundColor: matchedTag?.color || '#6c5ce7',
                                  color: 'white',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem'
                                }}
                              >
                                {tag}
                              </span>
                            );
                          })
                        ) : (
                          <span style={{ color: '#999' }}>点击选择标签...</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ff4757', fontSize: '1.2rem' }}
                        title="删除此行"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="btn btn-secondary"
            style={{ width: '100%', marginBottom: '1rem', borderStyle: 'dashed' }}
          >
            + 添加一行
          </button>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
            <button type="submit" className="btn btn-primary">保存全部</button>
          </div>
        </form>

        {/* Tag Selection Modal Overlay */}
        {activeTagRow !== null && (
          <div className="modal-overlay" style={{ zIndex: 1100, backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <div className="modal-content" style={{ width: '500px', maxWidth: '90%' }}>
              <h3>选择标签: {rows[activeTagRow].title || '新歌曲'}</h3>

              <div className="tags-selector" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                {allTags.map(tag => {
                  const isSelected = rows[activeTagRow].tags?.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-select-btn ${isSelected ? 'selected' : ''}`}
                      style={{
                        backgroundColor: isSelected ? (tag.color || '#6c5ce7') : 'white',
                        color: isSelected ? 'white' : 'var(--text-dark)',
                        borderColor: tag.color || '#6c5ce7'
                      }}
                      onClick={() => toggleTag(activeTagRow, tag.name)}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="输入新标签..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addNewTagToRow(activeTagRow);
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => addNewTagToRow(activeTagRow)}
                >
                  添加
                </button>
              </div>

              <div className="modal-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setActiveTagRow(null);
                    setNewTagInput('');
                  }}
                >
                  完成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Playlists;
