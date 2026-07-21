import React, { useEffect, useState } from 'react';
import { useFeedback } from '../components/FeedbackProvider';
import { prizeService } from '../services';
import {
  IMAGE_ACCEPT,
  PrizeBasicFields,
  PrizeOptionsEditor,
  PrizeStatusFields,
  buildPrizePayload,
  formFromPrizeItem,
  getEmptyPrizeForm,
  getImageUrl,
  getUploadErrorMessage,
  prepareImageFile,
  validateImageFiles
} from './PrizeAdminForm';

function AdminPrizeEditorModal({ prizeId, draft = null, items = [], onClose, onSaved, onDeleted }) {
  const { confirm } = useFeedback();
  const isNew = !prizeId;
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(getEmptyPrizeForm);
  const [pendingCreateImages, setPendingCreateImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setMessage('');
    setError('');
    if (isNew) {
      setItem(null);
      setForm(draft || getEmptyPrizeForm());
    } else {
      const nextItem = items.find((entry) => String(entry.id) === String(prizeId));
      setItem(nextItem || null);
      setForm(draft || formFromPrizeItem(nextItem));
      if (!nextItem) setError('没有找到这个礼物，可能已经被删除。');
    }
    setLoading(false);
  }, [draft, isNew, items, prizeId]);

  const uploadPrizeFiles = async (targetPrizeId, files) => {
    for (const file of files) {
      const image = file.data_url ? file : await prepareImageFile(file);
      await prizeService.uploadPrizeImages(targetPrizeId, [{ url: image.data_url, alt_text: form.name || image.filename }]);
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(''); setError('');
    try {
      const payload = buildPrizePayload(form);
      const response = isNew ? await prizeService.createAdminItem(payload) : await prizeService.updateAdminItem(prizeId, payload);
      const savedId = Number(prizeId || response.id || response.data?.id);
      if (isNew && pendingCreateImages.length) await uploadPrizeFiles(savedId, pendingCreateImages);
      setPendingCreateImages([]);
      setMessage(isNew ? '礼物已创建' : '礼物已更新');
      await onSaved?.({ ...item, ...payload, id: savedId }, { wasNew: isNew });
    } catch (err) {
      setError(getUploadErrorMessage(err) || '保存礼物失败');
    } finally { setSaving(false); }
  };

  const handleCreateImageSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      validateImageFiles(files);
      const images = await Promise.all(files.map(prepareImageFile));
      setPendingCreateImages((current) => [...current, ...images]);
    } catch (err) { setError(getUploadErrorMessage(err) || '读取图片失败'); }
    finally { event.target.value = ''; }
  };

  const handleUploadImages = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !item) return;
    setUploading(true); setError(''); setMessage('');
    try {
      validateImageFiles(files);
      await uploadPrizeFiles(item.id, files);
      setMessage('图片已上传');
      await onSaved?.(item, { imagesOnly: true });
    } catch (err) { setError(getUploadErrorMessage(err) || '上传图片失败'); }
    finally { setUploading(false); event.target.value = ''; }
  };

  const moveImage = async (imageId, direction) => {
    if (!item?.images?.length) return;
    const images = [...item.images];
    const index = images.findIndex((image) => image.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
    [images[index], images[nextIndex]] = [images[nextIndex], images[index]];
    try {
      await prizeService.updatePrizeImageOrder(item.id, images.map((image) => image.id));
      setItem({ ...item, images });
      await onSaved?.({ ...item, images }, { imagesOnly: true });
    } catch (err) { setError(err.response?.data?.message || '调整图片顺序失败'); }
  };

  const deleteImage = async (imageId) => {
    if (!item) return;
    const confirmed = await confirm({ title: '删除礼物图片', message: '确定删除这张图片吗？', confirmText: '删除图片', variant: 'danger' });
    if (!confirmed) return;
    try {
      await prizeService.deletePrizeImage(item.id, imageId);
      const nextItem = { ...item, images: item.images.filter((image) => image.id !== imageId) };
      setItem(nextItem); setMessage('图片已删除');
      await onSaved?.(nextItem, { imagesOnly: true });
    } catch (err) { setError(err.response?.data?.message || '删除图片失败'); }
  };

  const handleDeleteItem = async () => {
    if (!item) return;
    const confirmed = await confirm({ title: '删除礼物', message: `确定删除「${item.name}」吗？`, detail: '删除后用户兑换页和后台礼物列表都不会再显示它。', confirmText: '删除礼物', variant: 'danger' });
    if (!confirmed) return;
    try { await prizeService.deleteAdminItem(item.id); await onDeleted?.(item); }
    catch (err) { setError(err.response?.data?.message || '删除礼物失败'); }
  };

  return <div className="prize-editor-modal-overlay" role="presentation" onMouseDown={onClose}>
    <div className="prize-editor-modal" role="dialog" aria-modal="true" aria-label={isNew ? '新建礼物' : '编辑礼物'} onMouseDown={(event) => event.stopPropagation()}>
      <header className="prize-editor-modal-header"><div><h2>{isNew ? '新建礼物' : '编辑礼物'}</h2><p>管理商品图片、基础信息、积分库存、子选项和展示状态。</p></div><div className="admin-prize-editor-header-actions">{!isNew && item && <button type="button" className="danger-action" onClick={handleDeleteItem}>删除礼物</button>}<button type="button" className="secondary-action" onClick={onClose}>关闭</button></div></header>

      <div className="prize-editor-modal-body">
        {loading ? <div className="loading">正在加载礼物编辑...</div> : <>
          {message && <div className="prizes-success">{message}</div>}{error && <div className="prizes-error">{error}</div>}
          {isNew ? <section className="prize-editor-panel image-manager full-image-manager top-image-manager">
            <div className="panel-toolbar"><div><h2>商品图片</h2><p>可选择多张图片，保存礼物后按选择顺序追加。</p></div><label className="file-button">选择商品图片<input type="file" accept={IMAGE_ACCEPT} multiple onChange={handleCreateImageSelect} /></label></div>
            {pendingCreateImages.length ? <div className="image-admin-grid pending-image-grid">{pendingCreateImages.map((image, index) => <div key={`${image.filename}-${index}`} className="image-admin-item"><img src={image.data_url} alt={image.filename || `待上传图片 ${index + 1}`} /><div className="image-admin-actions"><button type="button" className="danger-text" onClick={() => setPendingCreateImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div></div>)}</div> : <div className="empty-inline">还没有选择商品图片</div>}
          </section> : item && <section className="prize-editor-panel image-manager full-image-manager top-image-manager">
            <div className="panel-toolbar"><div><h2>商品图片</h2><p>上传图片会追加到现有图片，不会替换原图。</p></div><label className="file-button">{uploading ? '上传中...' : '追加商品图片'}<input type="file" accept={IMAGE_ACCEPT} multiple onChange={handleUploadImages} disabled={uploading} /></label></div>
            <div className="image-admin-grid">{(item.images || []).map((image, index) => <div key={image.id} className="image-admin-item"><img src={getImageUrl(image.image_url)} alt={item.name} /><div className="image-admin-actions"><button type="button" onClick={() => moveImage(image.id, -1)} disabled={index === 0}>上移</button><button type="button" onClick={() => moveImage(image.id, 1)} disabled={index === item.images.length - 1}>下移</button><button type="button" className="danger-text" onClick={() => deleteImage(image.id)}>删除</button></div></div>)}{!item.images?.length && <div className="empty-inline">还没有图片</div>}</div>
          </section>}

          <form id="prize-full-editor-modal-form" onSubmit={handleSave} className="prize-full-editor-form">
            <section className="prize-editor-panel"><div className="panel-toolbar"><h2>基础信息</h2></div><div className="prize-editor-form"><PrizeBasicFields form={form} setForm={setForm} /></div></section>
            <section className="prize-editor-panel"><div className="panel-toolbar"><h2>子选项</h2></div><PrizeOptionsEditor form={form} setForm={setForm} /></section>
            <section className="prize-editor-panel"><div className="panel-toolbar"><h2>展示设置</h2></div><div className="prize-editor-form"><PrizeStatusFields form={form} setForm={setForm} /></div></section>
          </form>
        </>}
      </div>
      <footer className="prize-editor-modal-footer"><button type="button" className="secondary-action" onClick={onClose}>取消</button><button className="primary-action" form="prize-full-editor-modal-form" disabled={saving || loading}>{saving ? '保存中...' : '保存礼物'}</button></footer>
    </div>
  </div>;
}

export default AdminPrizeEditorModal;
