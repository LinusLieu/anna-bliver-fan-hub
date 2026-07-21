import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { prizeService } from '../services';
import BackButton from '../components/BackButton';
import './AdminPrizes.css';

const emptyForm = () => ({ name: '', description: '', cost: 0, stock: 0, delivery_type: 'physical', is_active: true, auto_carousel: false, image_url: '', options: [] });
const normalize = (item) => ({ ...emptyForm(), ...item, options: (item?.options || []).map((option) => ({ ...option })) });

export default function AdminPrizes() {
  const navigate = useNavigate();
  const { prizeId } = useParams();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await prizeService.getAdminItems();
    const rows = response.data || response || [];
    setItems(rows);
    if (prizeId) setForm(normalize(rows.find((item) => String(item.id) === String(prizeId))));
    setLoading(false);
  }, [prizeId]);
  useEffect(() => { load(); }, [load]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateOption = (index, field, value) => update('options', form.options.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const addOption = () => update('options', [...form.options, { name: '', description: '', cost: Number(form.cost || 0), stock: 0, is_active: true }]);

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const payload = { ...form, cost: Number(form.cost), stock: Number(form.stock), options: form.options.map((option) => ({ ...option, cost: Number(option.cost), stock: Number(option.stock) })) };
      if (prizeId) await prizeService.updateAdminItem(prizeId, payload);
      else await prizeService.createAdminItem(payload);
      setMessage('商品已保存'); navigate('/admin/prizes'); await load();
    } catch (error) { setMessage(error.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const edit = (item) => { setForm(normalize(item)); navigate(`/admin/prizes/${item.id}/edit`); };
  const remove = async (item) => { if (!window.confirm(`确认下架“${item.name}”？`)) return; await prizeService.deleteAdminItem(item.id); await load(); };

  if (loading) return <div className="loading">正在加载商品...</div>;
  return <div className="container admin-prizes-page">
    <BackButton to="/" /><header className="page-header"><h1>商城商品管理</h1><button className="btn btn-primary" onClick={() => { setForm(emptyForm()); navigate('/admin/prizes/new'); }}>新增商品</button></header>
    {message && <div className="form-success">{message}</div>}
    <div className="admin-prize-layout">
      <div className="admin-prize-list">{items.map((item) => <article key={item.id} className="admin-prize-card">
        <img src={item.images?.[0]?.image_url || item.image_url || '/annapiggy-logo.png'} alt={item.name} />
        <div><h2>{item.name}</h2><p>{item.cost} 积分 · 库存 {item.stock} · {item.is_active ? '上架' : '下架'}</p></div>
        <button className="btn btn-secondary" onClick={() => edit(item)}>编辑</button><button className="danger-text" onClick={() => remove(item)}>下架</button>
      </article>)}</div>
      {(prizeId || window.location.pathname.endsWith('/new')) && <form className="admin-prize-form" onSubmit={save}>
        <h2>{prizeId ? '编辑商品' : '新增商品'}</h2>
        <label>商品名称<input value={form.name} onChange={(e) => update('name', e.target.value)} required /></label>
        <label>商品介绍<textarea value={form.description} onChange={(e) => update('description', e.target.value)} rows="4" /></label>
        <div className="admin-prize-form-grid"><label>积分价格<input type="number" min="0" value={form.cost} onChange={(e) => update('cost', e.target.value)} required /></label><label>库存<input type="number" min="0" value={form.stock} onChange={(e) => update('stock', e.target.value)} required /></label></div>
        <label>展示图片 URL<input value={form.image_url || ''} onChange={(e) => update('image_url', e.target.value)} placeholder="https://... 或 /uploads/..." /></label>
        <label>配送方式<select value={form.delivery_type} onChange={(e) => update('delivery_type', e.target.value)}><option value="physical">实体商品</option><option value="virtual">虚拟商品</option></select></label>
        <label className="toggle-line"><input type="checkbox" checked={form.is_active} onChange={(e) => update('is_active', e.target.checked)} />上架商品</label>
        <section className="admin-prize-options"><div><h3>商品选项</h3><button type="button" onClick={addOption}>添加选项</button></div>{form.options.map((option, index) => <div key={option.id || index} className="admin-prize-option-row">
          <input value={option.name} onChange={(e) => updateOption(index, 'name', e.target.value)} placeholder="选项名称" required />
          <input type="number" min="0" value={option.cost} onChange={(e) => updateOption(index, 'cost', e.target.value)} placeholder="积分" />
          <input type="number" min="0" value={option.stock} onChange={(e) => updateOption(index, 'stock', e.target.value)} placeholder="库存" />
          <button type="button" className="danger-text" onClick={() => update('options', form.options.filter((_, i) => i !== index))}>删除</button>
        </div>)}</section>
        <div className="form-actions"><button type="button" className="btn btn-outline" onClick={() => navigate('/admin/prizes')}>取消</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '保存中...' : '保存商品'}</button></div>
      </form>}
    </div>
  </div>;
}
