import React, { useCallback, useEffect, useState } from 'react';
import { authService, pointsService, prizeService } from '../services';
import BackButton from '../components/BackButton';
import BilibiliBinding from '../components/BilibiliBinding';
import './Profile.css';

const SOURCE_LABELS = {
  auto_bilibili: 'B站投喂折算',
  manual_adjustment: '管理员调整',
  csv_import: 'CSV 导入',
  redemption: '商城兑换',
  redemption_refund: '兑换退款'
};

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatDate = (value) => value ? new Date(value).toLocaleString() : '-';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [profile, pointSummary, orderRows] = await Promise.all([
        authService.getProfile(), pointsService.getSummary(), prizeService.getUserOrders()
      ]);
      setUser(profile); setSummary(pointSummary); setOrders(orderRows || []);
    } catch (err) {
      setError(err.response?.data?.message || '个人资料加载失败');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTransactions = async () => {
    if (transactions.length) return setTransactions([]);
    const data = await pointsService.getTransactions(1, 50);
    setTransactions(data.transactions || []);
  };

  const toggleOrder = async (id) => {
    if (expandedOrder === id) return setExpandedOrder(null);
    setExpandedOrder(id);
    if (!orderDetails[id]) {
      const details = await prizeService.getUserOrder(id);
      setOrderDetails((current) => ({ ...current, [id]: details }));
    }
  };

  if (error) return <div className="container"><div className="form-error">{error}</div></div>;
  if (!user || !summary) return <div className="loading">正在加载个人资料...</div>;

  return (
    <div className="container profile-page">
      <BackButton to="/" />
      <h1 className="page-title">我的个人资料</h1>

      <section className="profile-overview">
        <div><span>用户名</span><strong>{user.username}</strong></div>
        <div><span>邮箱</span><strong>{user.email}</strong></div>
        <div><span>角色</span><strong>{user.role}</strong></div>
        <div className="points"><span>可用积分</span><strong>{formatNumber(summary.points)}</strong></div>
      </section>

      <BilibiliBinding />

      <section className="profile-points-panel">
        <div className="profile-points-panel-header"><h2>积分钱包</h2><span>所有已绑定 UID 共享余额</span></div>
        <div className="profile-points-summary-grid">
          <div className="profile-point-stat"><span>当前积分</span><strong>{formatNumber(summary.points)}</strong></div>
          <div className="profile-point-stat"><span>投喂折算</span><strong>{formatNumber(summary.auto_points)}</strong></div>
          <div className="profile-point-stat"><span>手工调整</span><strong>{formatNumber(summary.manual_points)}</strong></div>
          <div className="profile-point-stat"><span>CSV 导入</span><strong>{formatNumber(summary.import_points)}</strong></div>
          <div className="profile-point-stat"><span>商城支出</span><strong>{formatNumber(summary.redemption_spent)}</strong></div>
          <div className="profile-point-stat"><span>待折算电池</span><strong>{formatNumber(summary.remainder_battery)}</strong></div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={loadTransactions}>{transactions.length ? '收起积分流水' : '查看积分流水'}</button>
        {transactions.length > 0 && <div className="profile-transaction-list">
          {transactions.map((tx) => <article key={tx.id}>
            <div><strong>{SOURCE_LABELS[tx.source] || tx.source}</strong><span>{tx.reason || ''}</span></div>
            <div className={Number(tx.points_delta) < 0 ? 'negative' : 'positive'}>{Number(tx.points_delta) > 0 ? '+' : ''}{formatNumber(tx.points_delta)}</div>
            <time>{formatDate(tx.created_at)}</time>
          </article>)}
        </div>}
      </section>

      <section className="profile-orders-panel">
        <h2>商城订单</h2>
        {!orders.length && <p>还没有兑换订单。</p>}
        {orders.map((order) => <article key={order.id} className="profile-order-card">
          <button type="button" onClick={() => toggleOrder(order.id)}>
            <span>订单 #{order.id}</span><strong>{formatNumber(order.points_total)} 积分</strong><span>{order.status}</span>
          </button>
          {expandedOrder === order.id && orderDetails[order.id] && <div className="profile-order-items">
            {(orderDetails[order.id].items || []).map((item) => <div key={item.id}>
              <span>{item.prize_name}{item.option_name ? ` · ${item.option_name}` : ''} × {item.quantity}</span>
              <strong>{formatNumber(item.points_cost)} 积分</strong>
            </div>)}
          </div>}
        </article>)}
      </section>
    </div>
  );
}
