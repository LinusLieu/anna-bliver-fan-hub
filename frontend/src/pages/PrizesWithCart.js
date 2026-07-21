import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { authService, prizeService } from '../services';
import BackButton from '../components/BackButton';

const API_ORIGIN = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const imageUrl = (value) => {
  if (!value) return '/annapiggy-logo.png';
  if (/^https?:|^data:/i.test(value)) return value;
  return value.startsWith('/uploads/') ? `${API_ORIGIN}${value}` : value;
};
const activeOptions = (prize) => (prize?.options || []).filter((option) => option.is_active !== 0);
const unitCost = (prize, option) => Number(option?.cost ?? prize?.cost ?? 0);
const stockOf = (prize, option) => Number(option?.stock ?? prize?.stock ?? 0);
const emptyAddress = { recipient_name: '', phone: '', province: '', city: '', district: '', address_line: '', postal_code: '', is_default: false };

export default function PrizesWithCart() {
  const [prizes, setPrizes] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [redeemPrize, setRedeemPrize] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [redeemQuantity, setRedeemQuantity] = useState(1);
  const [checkout, setCheckout] = useState(null);
  const [addressId, setAddressId] = useState('');
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const authenticated = authService.isAuthenticated();
  const loadCart = useCallback(async () => {
    if (!authenticated) return setCartItems([]);
    setCartItems(await prizeService.getCart());
  }, [authenticated]);

  useEffect(() => {
    Promise.all([prizeService.getAllPrizes(), loadCart(), authenticated ? prizeService.getShippingAddresses() : []])
      .then(([items, , addressRows]) => { setPrizes(items || []); setAddresses(addressRows || []); setAddressId(String(addressRows?.find((item) => item.is_default)?.id || addressRows?.[0]?.id || '')); })
      .catch((err) => setError(err.response?.data?.message || '商城加载失败'))
      .finally(() => setLoading(false));
  }, [authenticated, loadCart]);

  const selectedOption = activeOptions(redeemPrize).find((option) => String(option.id) === String(selectedOptionId));
  const selectedCost = unitCost(redeemPrize, selectedOption) * redeemQuantity;
  const selectedStock = stockOf(redeemPrize, selectedOption);
  const needsOption = activeOptions(redeemPrize).length > 0 && !selectedOption;

  const isRedeemConfirmDisabled = !redeemPrize || needsOption || redeemQuantity < 1 || redeemQuantity > selectedStock;

  const openPrize = (prize) => {
    const options = activeOptions(prize);
    setRedeemPrize(prize); setSelectedOptionId(options.length === 1 ? String(options[0].id) : ''); setRedeemQuantity(1); setMessage('');
  };

  const handleAddToCart = async () => {
    if (!authenticated) return setMessage('请先登录后使用购物车');
    if (isRedeemConfirmDisabled) return;
    setBusy(true);
    try {
      const nextCart = await prizeService.addCartItem({ prize_id: redeemPrize.id, prize_option_id: selectedOption?.id || null, quantity: redeemQuantity, currency_type: 'points' });
      setCartItems(Array.isArray(nextCart) ? nextCart : []);
      setRedeemPrize(null); setCartOpen(true);
    } catch (err) { setMessage(err.response?.data?.message || '加入购物车失败'); }
    finally { setBusy(false); }
  };

  const handleConfirmRedeem = () => {
    if (!authenticated) return setMessage('请先登录后兑换');
    if (isRedeemConfirmDisabled) return;
    setCheckout({ mode: 'direct', prize: redeemPrize, option: selectedOption, quantity: redeemQuantity, points: selectedCost });
    setRedeemPrize(null);
  };

  const updateCartItem = async (id, data) => {
    setBusy(true);
    try { setCartItems(await prizeService.updateCartItem(id, { ...data, currency_type: 'points' })); }
    finally { setBusy(false); }
  };

  const removeCartItem = async (id) => {
    setBusy(true);
    try { setCartItems(await prizeService.deleteCartItem(id)); }
    finally { setBusy(false); }
  };

  const clearCart = async () => {
    setBusy(true);
    try { await prizeService.clearCart(); setCartItems([]); }
    finally { setBusy(false); }
  };

  const cartTotal = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.cost || 0) * Number(item.quantity || 0), 0), [cartItems]);
  const cartHasPhysical = cartItems.some((item) => item.delivery_type !== 'virtual');

  const checkoutCart = () => {
    if (!cartItems.length) return;
    setCheckout({ mode: 'cart', points: cartTotal, physical: cartHasPhysical });
    setCartOpen(false);
  };

  const applyRemainingBalances = (remainingBalances = {}) => {
    const user = authService.getCurrentUser();
    if (!user || remainingBalances.points === undefined) return;
    const updatedUser = { ...user, points: remainingBalances.points };
    authService.setCurrentUser(updatedUser);
    setCurrentUser(updatedUser);
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await prizeService.createShippingAddress(addressForm);
      const next = await prizeService.getShippingAddresses();
      setAddresses(next); setAddressId(String(result.id)); setAddressForm(emptyAddress);
    } catch (err) { setMessage(err.response?.data?.message || '地址保存失败'); }
    finally { setBusy(false); }
  };

  const submitCheckout = async () => {
    const needsAddress = checkout.mode === 'cart' ? checkout.physical : checkout.prize.delivery_type !== 'virtual';
    if (needsAddress && !addressId) return setMessage('请选择收货地址');
    setBusy(true); setMessage('');
    try {
      const result = checkout.mode === 'cart'
        ? await prizeService.checkoutCart({ address_id: addressId || null, remark })
        : await prizeService.redeemPrize(checkout.prize.id, { prizeOptionId: checkout.option?.id || null, quantity: checkout.quantity, addressId: addressId || null, remark, currencyType: 'points' });
      applyRemainingBalances(result.remainingBalances || { points: result.remaining_points });
      await loadCart();
      setCheckout(null); setRemark(''); setMessage(`兑换成功，订单号 #${result.order_id}`);
    } catch (err) { setMessage(err.response?.data?.message || '结算失败'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="loading">正在加载积分商城...</div>;

  return (
    <div className="container prizes-page">
      <BackButton to="/" />
      <header className="prizes-toolbar">
        <div><h1>积分商城</h1><p>当前积分：{Number(currentUser?.points || 0).toLocaleString()}</p></div>
        <button type="button" className="btn btn-secondary" onClick={() => setCartOpen(true)}>购物车 ({cartItems.length})</button>
      </header>
      {(error || message) && <div className={error ? 'form-error' : 'form-success'}>{error || message}</div>}

      <div className="prizes-grid">
        {prizes.map((prize) => {
          const options = activeOptions(prize);
          const costs = options.length ? options.map((item) => Number(item.cost)) : [Number(prize.cost)];
          return <article className="prize-card" key={prize.id}>
            <img src={imageUrl(prize.images?.[0]?.image_url || prize.image_url)} alt={prize.name} />
            <div className="prize-card-body"><h2>{prize.name}</h2><p>{prize.description}</p>
              <div className="prize-card-meta"><strong>{Math.min(...costs)}{Math.max(...costs) !== Math.min(...costs) ? `-${Math.max(...costs)}` : ''} 积分</strong><span>库存 {prize.stock}</span></div>
              <button type="button" className="btn btn-primary" onClick={() => openPrize(prize)}>选择兑换</button>
            </div>
          </article>;
        })}
      </div>

      {redeemPrize && <div className="prize-checkout-modal" role="dialog" aria-modal="true" onClick={() => setRedeemPrize(null)}>
        <div className="prize-checkout-modal-content" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="prize-redeem-modal-close" onClick={() => setRedeemPrize(null)} aria-label="关闭">×</button>
          <img className="prize-modal-image" src={imageUrl(selectedOption?.image_url || redeemPrize.images?.[0]?.image_url || redeemPrize.image_url)} alt={redeemPrize.name} />
          <h2>{redeemPrize.name}</h2><p>{redeemPrize.description}</p>
          {activeOptions(redeemPrize).length > 0 && <div className="prize-option-buttons">{activeOptions(redeemPrize).map((option) => <button key={option.id} type="button" className={String(option.id) === selectedOptionId ? 'selected' : ''} onClick={() => setSelectedOptionId(String(option.id))}>{option.name} · {option.cost} 积分</button>)}</div>}
          <label>数量<input type="number" min="1" max={selectedStock} value={redeemQuantity} onChange={(event) => setRedeemQuantity(Math.max(1, Number(event.target.value)))} /></label>
          <p>合计 <strong>{selectedCost} 积分</strong></p>
          <div className="prize-modal-actions"><button type="button" className="btn btn-outline" onClick={handleAddToCart} disabled={busy || isRedeemConfirmDisabled}>加入购物车</button><button type="button" className="btn btn-primary" onClick={handleConfirmRedeem} disabled={busy || isRedeemConfirmDisabled}>立即兑换</button></div>
        </div>
      </div>}

      {cartOpen && <div className="prize-cart-overlay" onClick={() => setCartOpen(false)}><aside className="prize-cart-drawer" onClick={(event) => event.stopPropagation()}>
        <header><h2>购物车</h2><button type="button" onClick={() => setCartOpen(false)} aria-label="关闭">×</button></header>
        <div className="prize-cart-list">{cartItems.map((item) => <article className="prize-cart-item" key={item.id}>
          <img src={imageUrl(item.image_url)} alt={item.name} /><div><strong>{item.name}{item.option_name ? ` · ${item.option_name}` : ''}</strong><span>{item.cost} 积分</span>
          <input type="number" min="1" max={item.stock} value={item.quantity} onChange={(event) => updateCartItem(item.id, { quantity: Number(event.target.value) })} />
          <button type="button" className="danger-text" onClick={() => removeCartItem(item.id)}>移除</button></div>
        </article>)}</div>
        <div className="prize-cart-summary"><span>积分合计</span><strong>{cartTotal} 积分</strong></div>
        <div className="prize-cart-actions"><button type="button" className="btn btn-outline" onClick={clearCart} disabled={busy}>清空</button><button type="button" className="btn btn-primary" onClick={checkoutCart} disabled={!cartItems.length || busy}>结算购物车</button></div>
      </aside></div>}

      {checkout && <div className="prize-checkout-modal" role="dialog" aria-modal="true" onClick={() => setCheckout(null)}><div className="prize-checkout-modal-content" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="prize-redeem-modal-close" onClick={() => setCheckout(null)} aria-label="关闭">×</button>
        <h2>确认结算</h2><p>本次共需 <strong>{checkout.points} 积分</strong></p>
        <section className="prize-address-section"><h3>收货地址</h3>{addresses.map((address) => <label key={address.id} className="prize-address-option"><input type="radio" checked={String(addressId) === String(address.id)} onChange={() => setAddressId(String(address.id))} /><span>{address.recipient_name} {address.phone}<br />{address.province}{address.city}{address.district}{address.address_line}</span></label>)}
        <form className="prize-address-form" onSubmit={saveAddress}><h4>新增地址</h4>{['recipient_name','phone','province','city','district','address_line','postal_code'].map((field) => <input key={field} value={addressForm[field]} onChange={(event) => setAddressForm({ ...addressForm, [field]: event.target.value })} placeholder={{ recipient_name:'收件人', phone:'手机号', province:'省', city:'市', district:'区/县', address_line:'详细地址', postal_code:'邮编（选填）' }[field]} required={['recipient_name','phone','address_line'].includes(field)} />)}<button type="submit" className="btn btn-secondary" disabled={busy}>保存地址</button></form></section>
        <label>订单备注<textarea value={remark} onChange={(event) => setRemark(event.target.value)} rows="2" /></label>
        <button type="button" className="btn btn-primary" onClick={submitCheckout} disabled={busy}>{busy ? '提交中...' : '确认提交'}</button>
      </div></div>}
    </div>
  );
}
