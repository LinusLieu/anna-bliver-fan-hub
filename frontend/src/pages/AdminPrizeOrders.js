import React, { useCallback, useEffect, useState } from 'react';
import { prizeService } from '../services';
import BackButton from '../components/BackButton';
import './AdminPrizeOrders.css';

const STATUSES = ['pending', 'processing', 'shipped', 'completed', 'cancelled', 'rejected'];

export default function AdminPrizeOrders() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await prizeService.getAdminOrders(filter ? { status: filter } : {});
    setOrders(response.data || response || []);
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const open = async (id) => setSelected(await prizeService.getAdminOrder(id));
  const update = async (status) => {
    if (['cancelled', 'rejected'].includes(status) && !reason.trim()) return setMessage('取消或拒绝订单时请填写原因');
    await prizeService.updateOrderStatus(selected.id, status, reason);
    setMessage('订单状态已更新'); setSelected(await prizeService.getAdminOrder(selected.id)); await load();
  };

  return <div className="container admin-orders-page"><BackButton to="/" />
    <header className="page-header"><h1>商城订单管理</h1><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">全部状态</option>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></header>
    {message && <div className="form-success">{message}</div>}
    <div className="admin-orders-table">{orders.map((order) => <button type="button" key={order.id} onClick={() => open(order.id)}>
      <span>#{order.id}</span><strong>{order.username}</strong><span>{order.points_total} 积分</span><span>{order.status}</span><time>{new Date(order.created_at).toLocaleString()}</time>
    </button>)}</div>
    {selected && <div className="prize-checkout-modal" onClick={() => setSelected(null)}><section className="prize-checkout-modal-content" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="prize-redeem-modal-close" onClick={() => setSelected(null)}>×</button><h2>订单 #{selected.id}</h2>
      <p>{selected.recipient_name} {selected.phone}</p><p>{selected.province}{selected.city}{selected.district}{selected.address_line}</p>
      {(selected.items || []).map((item) => <div key={item.id} className="admin-order-line"><span>{item.prize_name}{item.option_name ? ` · ${item.option_name}` : ''} × {item.quantity}</span><strong>{item.points_cost} 积分</strong></div>)}
      <label>处理备注<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="admin-order-actions">{STATUSES.map((status) => <button type="button" key={status} disabled={selected.status === status} onClick={() => update(status)}>{status}</button>)}</div>
    </section></div>}
  </div>;
}
