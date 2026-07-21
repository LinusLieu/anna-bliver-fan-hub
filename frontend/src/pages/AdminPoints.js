import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { pointsService } from '../services';
import BackButton from '../components/BackButton';
import { useFeedback } from '../components/FeedbackProvider';
import ImportPreviewUser from '../components/ImportPreviewUser';
import './AdminPoints.css';

const SOURCE_LABELS = {
  auto_bilibili: 'B站投喂折算',
  auto_bilibili_frozen: 'B站投喂折算（冻结）',
  manual_adjustment: '管理员调整',
  csv_import: 'CSV批量调整',
  redemption: '兑换扣分',
  redemption_refund: '兑换退款',
  frozen_merge: '冻结积分合并',
  frozen_migration: '自动积分转冻结'
};

const IMPORT_PREVIEW_PAGE_SIZE = 10;
const RECENT_TRANSACTION_LIMIT = 10;
const DETAIL_TRANSACTION_LIMIT = 20;
const DEFAULT_TRANSACTION_FILTERS = {
  source: 'all',
  direction: 'all',
  start_date: '',
  end_date: '',
  keyword: ''
};

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function getDefaultTransactionFilters() {
  return { ...DEFAULT_TRANSACTION_FILTERS };
}

function getTransactionAccountLabel(tx) {
  const parts = [];
  if (tx.bilibili_uname) parts.push(tx.bilibili_uname);
  if (tx.bilibili_uid) parts.push(`UID ${tx.bilibili_uid}`);
  return parts.join(' / ') || '-';
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch (error) {
    return {};
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function getImportDataLine(line) {
  const number = Number(line);
  return Number.isFinite(number) ? Math.max(1, number - 1) : line;
}

function getTransactionDisplay(tx) {
  const metadata = parseMetadata(tx.metadata);
  const delta = Number(tx.points_delta || 0);
  const isFrozenSettlement = tx.source === 'auto_bilibili_frozen';
  const hasFrozenBalance = hasOwn(metadata, 'frozen_balance_before')
    && hasOwn(metadata, 'frozen_balance_after');

  return {
    deltaText: `${isFrozenSettlement ? '冻结积分 ' : ''}${delta >= 0 ? '+' : ''}${formatNumber(delta)}`,
    balanceText: isFrozenSettlement && hasFrozenBalance
      ? `冻结 ${formatNumber(metadata.frozen_balance_before)} 到 ${formatNumber(metadata.frozen_balance_after)}`
      : `余额 ${formatNumber(tx.balance_before)} 到 ${formatNumber(tx.balance_after)}`
  };
}

function AdminPoints() {
  const { confirm } = useFeedback();
  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [newUid, setNewUid] = useState('');
  const [newUname, setNewUname] = useState('');
  const [csvText, setCsvText] = useState('bilibili_uid,bilibili_uname,points,reason\n');
  const [importPreview, setImportPreview] = useState(null);
  const [importPreviewPage, setImportPreviewPage] = useState(1);
  const [settling, setSettling] = useState(false);
  const [mergingFrozen, setMergingFrozen] = useState(false);
  const [refreshingNames, setRefreshingNames] = useState(false);
  const [transactionDetailOpen, setTransactionDetailOpen] = useState(false);
  const [detailTransactions, setDetailTransactions] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPagination, setDetailPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
    limit: DETAIL_TRANSACTION_LIMIT
  });
  const [detailFilters, setDetailFilters] = useState(getDefaultTransactionFilters);
  const [detailDraftFilters, setDetailDraftFilters] = useState(getDefaultTransactionFilters);

  const loadAccounts = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const data = await pointsService.getAdminAccounts(page, 20, search);
      setAccounts(data.accounts || []);
      setPagination(data.pagination || { page, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || '加载积分账户失败');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadAccountTransactions = useCallback(async (account, page, limit, filters = {}) => {
    if (!account) {
      return {
        transactions: [],
        pagination: { page, totalPages: 1, total: 0, limit }
      };
    }

    return account.wallet_id
      ? pointsService.getAdminWalletTransactions(account.wallet_id, page, limit, filters)
      : pointsService.getAdminAccountTransactions(account.bilibili_uid, page, limit, filters);
  }, []);

  const loadTransactions = useCallback(async (account) => {
    if (!account) return;
    try {
      setTxLoading(true);
      const data = await loadAccountTransactions(account, 1, RECENT_TRANSACTION_LIMIT);
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err.response?.data?.message || '加载积分流水失败');
    } finally {
      setTxLoading(false);
    }
  }, [loadAccountTransactions]);

  const loadDetailTransactions = useCallback(async ({
    account = selectedAccount,
    page = 1,
    filters = detailFilters
  } = {}) => {
    if (!account) return;

    try {
      setDetailLoading(true);
      setError('');
      const data = await loadAccountTransactions(account, page, DETAIL_TRANSACTION_LIMIT, filters);
      setDetailTransactions(data.transactions || []);
      setDetailPagination(data.pagination || {
        page,
        totalPages: 1,
        total: 0,
        limit: DETAIL_TRANSACTION_LIMIT
      });
    } catch (err) {
      setError(err.response?.data?.message || '加载详细流水失败');
      setDetailTransactions([]);
      setDetailPagination({
        page,
        totalPages: 1,
        total: 0,
        limit: DETAIL_TRANSACTION_LIMIT
      });
    } finally {
      setDetailLoading(false);
    }
  }, [detailFilters, loadAccountTransactions, selectedAccount]);

  useEffect(() => {
    loadAccounts(1);
  }, [loadAccounts]);

  const totals = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc.points += Number(account.points || 0);
      acc.frozen += Number(account.frozen_points || 0);
      acc.total += Number(account.total_points || 0);
      acc.auto += Number(account.auto_points || 0);
      acc.imported += Number(account.import_points || 0);
      acc.spent += Number(account.redemption_spent || 0);
      return acc;
    }, { points: 0, frozen: 0, total: 0, auto: 0, imported: 0, spent: 0 });
  }, [accounts]);

  const importPreviewRows = importPreview?.rows || [];
  const importPreviewTotalPages = Math.max(1, Math.ceil(importPreviewRows.length / IMPORT_PREVIEW_PAGE_SIZE));
  const safeImportPreviewPage = Math.min(importPreviewPage, importPreviewTotalPages);
  const importPreviewStartIndex = (safeImportPreviewPage - 1) * IMPORT_PREVIEW_PAGE_SIZE;
  const visibleImportPreviewRows = importPreviewRows.slice(
    importPreviewStartIndex,
    importPreviewStartIndex + IMPORT_PREVIEW_PAGE_SIZE
  );
  const importPreviewStart = importPreviewRows.length > 0 ? importPreviewStartIndex + 1 : 0;
  const importPreviewEnd = Math.min(importPreviewStartIndex + IMPORT_PREVIEW_PAGE_SIZE, importPreviewRows.length);
  const importPreviewErrorLines = importPreviewRows
    .filter(row => row.status === 'error' || row.error)
    .map(row => getImportDataLine(row.line))
    .filter(line => line || line === 0);

  const handleSearch = (event) => {
    event.preventDefault();
    loadAccounts(1);
  };

  const selectAccount = async (account) => {
    setSelectedAccount(account);
    setAdjustPoints('');
    setAdjustReason('');
    setMessage('');
    await loadTransactions(account);
    if (transactionDetailOpen) {
      const filters = getDefaultTransactionFilters();
      setDetailFilters(filters);
      setDetailDraftFilters(filters);
      await loadDetailTransactions({ account, page: 1, filters });
    }
  };

  const refreshSelectedAccount = async () => {
    const refreshed = await pointsService.getAdminAccounts(pagination.page, 20, search);
    setAccounts(refreshed.accounts || []);
    setPagination(refreshed.pagination || pagination);
    const updated = (refreshed.accounts || []).find(
      account => String(account.wallet_id || account.bilibili_uid) === String(selectedAccount?.wallet_id || selectedAccount?.bilibili_uid)
    );
    if (updated) {
      setSelectedAccount(updated);
      await loadTransactions(updated);
      if (transactionDetailOpen) {
        await loadDetailTransactions({
          account: updated,
          page: detailPagination.page,
          filters: detailFilters
        });
      }
    }
  };

  const openTransactionDetails = async () => {
    if (!selectedAccount) return;
    const filters = getDefaultTransactionFilters();
    setDetailFilters(filters);
    setDetailDraftFilters(filters);
    setDetailPagination({
      page: 1,
      totalPages: 1,
      total: 0,
      limit: DETAIL_TRANSACTION_LIMIT
    });
    setTransactionDetailOpen(true);
    await loadDetailTransactions({ account: selectedAccount, page: 1, filters });
  };

  const closeTransactionDetails = () => {
    setTransactionDetailOpen(false);
  };

  const handleDetailFilterChange = (field, value) => {
    setDetailDraftFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleDetailFilterSubmit = async (event) => {
    event.preventDefault();
    const filters = { ...detailDraftFilters };
    setDetailFilters(filters);
    await loadDetailTransactions({ account: selectedAccount, page: 1, filters });
  };

  const handleDetailFilterReset = async () => {
    const filters = getDefaultTransactionFilters();
    setDetailFilters(filters);
    setDetailDraftFilters(filters);
    await loadDetailTransactions({ account: selectedAccount, page: 1, filters });
  };

  const loadDetailPage = async (page) => {
    await loadDetailTransactions({ account: selectedAccount, page, filters: detailFilters });
  };

  const handleCreateAccount = async () => {
    if (!newUid) return;
    try {
      setError('');
      await pointsService.createAdminAccount(newUid, newUname);
      setMessage('积分账户已创建');
      setNewUid('');
      setNewUname('');
      await loadAccounts(1);
    } catch (err) {
      setError(err.response?.data?.message || '创建积分账户失败');
    }
  };

  const handleAdjust = async () => {
    if (!selectedAccount || !adjustPoints) return;
    if (!selectedAccount.bilibili_uid) {
      setError('这个钱包当前没有绑定或登记的B站UID，无法通过UID手动调整');
      return;
    }
    try {
      setError('');
      await pointsService.adjustAccountPoints(
        selectedAccount.bilibili_uid,
        Number(adjustPoints),
        adjustReason
      );
      setMessage('积分调整已保存');
      await refreshSelectedAccount();
      setAdjustPoints('');
      setAdjustReason('');
    } catch (err) {
      setError(err.response?.data?.message || '积分调整失败');
    }
  };

  const handlePreviewImport = async () => {
    try {
      setError('');
      const preview = await pointsService.previewImport(csvText);
      setImportPreview(preview);
      setImportPreviewPage(1);
    } catch (err) {
      setError(err.response?.data?.message || 'CSV预览失败');
      setImportPreview(null);
      setImportPreviewPage(1);
    }
  };

  const handleCommitImport = async () => {
    try {
      setError('');
      const result = await pointsService.commitImport(csvText);
      setImportPreview(result);
      setImportPreviewPage(1);
      setMessage(`批量调整完成：${result.valid_count || 0} 个UID，合计 ${result.total_points || 0} 积分`);
      loadAccounts(1);
    } catch (err) {
      setError(err.response?.data?.message || 'CSV批量调整失败');
      if (err.response?.data?.preview) {
        setImportPreview(err.response.data.preview);
        setImportPreviewPage(1);
      }
    }
  };

  const handleSettle = async () => {
    try {
      setSettling(true);
      setError('');
      const data = await pointsService.settle();
      const result = data.result || {};
      setMessage(`结算完成：${result.processed_accounts || 0} 个UID，新增 ${result.awarded_points || 0} 冻结积分，刷新 ${result.refreshed_profiles || 0} 个B站昵称`);
      loadAccounts(pagination.page);
    } catch (err) {
      setError(err.response?.data?.message || '手动结算失败');
    } finally {
      setSettling(false);
    }
  };

  const handleRefreshNames = async () => {
    const confirmed = await confirm({
      title: '刷新积分账户昵称',
      message: '确定要刷新所有积分账户的 B 站昵称吗？账户较多时可能需要等待一会儿。',
      confirmText: '开始刷新'
    });
    if (!confirmed) return;

    try {
      setRefreshingNames(true);
      setError('');
      const data = await pointsService.refreshAdminAccountProfiles([], true);
      const result = data.result || {};
      setMessage(`全部昵称刷新完成：共 ${result.requested_count || 0} 个UID，成功 ${result.updated_count || 0} 个，失败 ${result.failed_count || 0} 个`);
      await loadAccounts(pagination.page);
      if (selectedAccount) {
        await refreshSelectedAccount();
      }
    } catch (err) {
      setError(err.response?.data?.message || '刷新B站昵称失败');
    } finally {
      setRefreshingNames(false);
    }
  };

  const handleMergeFrozen = async () => {
    const confirmed = await confirm({
      title: '合并冻结积分',
      message: '确定要把所有冻结积分合并到可用积分吗？',
      detail: '此操作会影响全部积分账户，请确认当前结算状态无误。',
      confirmText: '确认合并',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      setMergingFrozen(true);
      setError('');
      const data = await pointsService.mergeAllFrozen();
      const result = data.result || {};
      setMessage(`合并完成：${result.merged_accounts || 0} 个UID，合并 ${result.merged_points || 0} 积分`);
      await loadAccounts(pagination.page);
      if (selectedAccount) {
        await refreshSelectedAccount();
      }
    } catch (err) {
      setError(err.response?.data?.message || '合并冻结积分失败');
    } finally {
      setMergingFrozen(false);
    }
  };

  return (
    <div className="admin-points">
      <BackButton to="/" />
      <div className="admin-points-header">
        <div>
          <h1>B站积分账户</h1>
          <p>按 B站 UID 管理积分，未注册网站的消费用户也会出现在这里。</p>
        </div>
        <div className="admin-points-actions">
          <button className="secondary-action" onClick={() => pointsService.exportCsv('accounts', search)}>
            导出账户
          </button>
          <button className="secondary-action" onClick={() => pointsService.exportCsv('transactions', search)}>
            导出流水
          </button>
          <button className="secondary-action" onClick={handleRefreshNames} disabled={refreshingNames || loading}>
            {refreshingNames ? '刷新中...' : '刷新全部昵称'}
          </button>
          <button className="primary-action" onClick={handleSettle} disabled={settling}>
            {settling ? '结算中...' : '手动结算'}
          </button>
          <button className="primary-action" onClick={handleMergeFrozen} disabled={mergingFrozen}>
            {mergingFrozen ? '合并中...' : '合并冻结积分'}
          </button>
        </div>
      </div>

      {message && <div className="points-success">{message}</div>}
      {error && <div className="points-error">{error}</div>}

      <div className="points-metrics">
        <div>
          <span>当前页余额</span>
          <strong>{formatNumber(totals.points)}</strong>
        </div>
        <div>
          <span>当前页冻结</span>
          <strong>{formatNumber(totals.frozen)}</strong>
        </div>
        <div>
          <span>当前页总积分</span>
          <strong>{formatNumber(totals.total)}</strong>
        </div>
        <div>
          <span>B站折算</span>
          <strong>{formatNumber(totals.auto)}</strong>
        </div>
        <div>
          <span>CSV调整</span>
          <strong>{formatNumber(totals.imported)}</strong>
        </div>
        <div>
          <span>兑换支出</span>
          <strong>{formatNumber(totals.spent)}</strong>
        </div>
      </div>

      <div className="points-layout">
        <section className="points-main">
          <form className="points-search" onSubmit={handleSearch}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 B站 UID、昵称、网站用户名、邮箱"
            />
            <button type="submit">搜索</button>
          </form>

          <div className="points-table-wrap">
            <table className="points-table">
              <thead>
                <tr>
                  <th>B站账户</th>
                  <th>网站绑定</th>
                  <th>余额</th>
                  <th>冻结</th>
                  <th>自动获得</th>
                  <th>手动/CSV</th>
                  <th>兑换支出</th>
                  <th>待折算</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" className="points-empty">加载中...</td></tr>
                ) : accounts.length === 0 ? (
                  <tr><td colSpan="8" className="points-empty">暂无积分账户</td></tr>
                ) : accounts.map(account => (
                  <tr
                    key={account.wallet_id || account.bilibili_uid}
                    className={String(selectedAccount?.wallet_id || selectedAccount?.bilibili_uid) === String(account.wallet_id || account.bilibili_uid) ? 'selected' : ''}
                    onClick={() => selectAccount(account)}
                    role="button"
                    tabIndex="0"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectAccount(account);
                      }
                    }}
                  >
                    <td>
                      <strong>{account.bilibili_uname || '未登记昵称'}</strong>
                      <span>{account.bilibili_uid}</span>
                      {Array.isArray(account.member_uids) && account.member_uids.length > 1 && (
                        <span>成员UID：{account.member_uids.join('、')}</span>
                      )}
                    </td>
                    <td>
                      <strong>{account.username || '未绑定网站用户'}</strong>
                      <span>{account.email || 'UID账户独立保留'}</span>
                    </td>
                    <td>{formatNumber(account.points)}</td>
                    <td>{formatNumber(account.frozen_points)}</td>
                    <td>{formatNumber(account.auto_points)}</td>
                    <td>{formatNumber(Number(account.manual_points || 0) + Number(account.import_points || 0))}</td>
                    <td>{formatNumber(account.redemption_spent)}</td>
                    <td>{formatNumber(account.remainder_battery)} 电池</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="points-pagination">
            <button disabled={pagination.page <= 1} onClick={() => loadAccounts(pagination.page - 1)}>
              上一页
            </button>
            <span>第 {pagination.page} / {pagination.totalPages || 1} 页，共 {pagination.total || 0} 个UID</span>
            <button disabled={pagination.page >= pagination.totalPages} onClick={() => loadAccounts(pagination.page + 1)}>
              下一页
            </button>
          </div>

          <section className="points-import">
            <div className="section-title-row">
              <h2>创建积分账户</h2>
              <span>用于登记还没有注册网站的 B站用户</span>
            </div>
            <div className="points-search">
              <input
                value={newUid}
                onChange={(event) => setNewUid(event.target.value)}
                placeholder="B站 UID"
              />
              <input
                value={newUname}
                onChange={(event) => setNewUname(event.target.value)}
                placeholder="B站昵称（可选）"
              />
              <button type="button" onClick={handleCreateAccount}>创建</button>
            </div>
          </section>

          <section className="points-import">
            <div className="section-title-row">
              <h2>CSV批量调整积分</h2>
              <span>表头支持 bilibili_uid, bilibili_uname, points, reason；正数加分，负数扣分</span>
            </div>
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows="8"
              spellCheck="false"
            />
            <div className="import-actions">
              <label className="file-button">
                读取CSV文件
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setCsvText(String(reader.result || ''));
                    reader.readAsText(file, 'utf-8');
                  }}
                />
              </label>
              <button className="secondary-action" onClick={handlePreviewImport}>预览调整</button>
              <button
                className="primary-action"
                disabled={!importPreview || importPreview.error_count > 0}
                onClick={handleCommitImport}
              >
                确认调整
              </button>
            </div>

            {importPreview && (
              <div className="import-preview">
                <div className="preview-summary">
                  可调整 {importPreview.valid_count} 行，错误 {importPreview.error_count} 行，合计 {importPreview.total_points} 积分
                  {importPreviewRows.length > 0 && (
                    <span className="preview-page-summary">
                      显示第 {importPreviewStart}-{importPreviewEnd} 行 / 共 {importPreviewRows.length} 行
                    </span>
                  )}
                </div>
                {importPreviewErrorLines.length > 0 && (
                  <div className="preview-error-lines">
                    错误行：第 {importPreviewErrorLines.slice(0, 12).join('、第 ')} 行
                    {importPreviewErrorLines.length > 12 ? ` 等 ${importPreviewErrorLines.length} 行` : ''}
                  </div>
                )}
                <div className="preview-list">
                  {visibleImportPreviewRows.map(row => (
                    <div key={row.line} className={`preview-row ${row.status}`}>
                      <span>第 {getImportDataLine(row.line)} 行</span>
                      <strong className="preview-csv-name">{row.bilibili_uname || 'CSV未填昵称'}</strong>
                      <ImportPreviewUser row={row} />
                      <span className="preview-row-value">{row.points || row.points === 0 ? `${row.points} 积分` : row.error}</span>
                      {row.error && <em>{row.error}</em>}
                    </div>
                  ))}
                </div>
                {importPreviewTotalPages > 1 && (
                  <div className="preview-pagination">
                    <button
                      type="button"
                      onClick={() => setImportPreviewPage(1)}
                      disabled={safeImportPreviewPage <= 1}
                    >
                      首页
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportPreviewPage(page => Math.max(1, page - 1))}
                      disabled={safeImportPreviewPage <= 1}
                    >
                      上一页
                    </button>
                    <span>第 {safeImportPreviewPage} / {importPreviewTotalPages} 页</span>
                    <button
                      type="button"
                      onClick={() => setImportPreviewPage(page => Math.min(importPreviewTotalPages, page + 1))}
                      disabled={safeImportPreviewPage >= importPreviewTotalPages}
                    >
                      下一页
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportPreviewPage(importPreviewTotalPages)}
                      disabled={safeImportPreviewPage >= importPreviewTotalPages}
                    >
                      末页
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </section>

        <aside className={`points-detail ${selectedAccount ? 'open' : ''}`}>
          {selectedAccount ? (
            <>
              <div className="detail-header">
                <div>
                  <h2>{selectedAccount.bilibili_uname || '未登记昵称'}</h2>
                  <span>钱包 #{selectedAccount.wallet_id || '-'}</span>
                  <span>主UID {selectedAccount.primary_bilibili_uid || selectedAccount.bilibili_uid || '无'}</span>
                  {selectedAccount.bilibili_uid && (
                    <span>当前代表UID {selectedAccount.bilibili_uid}</span>
                  )}
                  {Array.isArray(selectedAccount.member_uids) && selectedAccount.member_uids.length > 1 && (
                    <span>家庭组：{selectedAccount.member_uids.join('、')}</span>
                  )}
                  {(!Array.isArray(selectedAccount.member_uids) || selectedAccount.member_uids.length === 0) && (
                    <span>历史钱包，无当前UID成员</span>
                  )}
                </div>
                <button onClick={() => setSelectedAccount(null)}>关闭</button>
              </div>

              <div className="detail-balance">
                <span>可用余额</span>
                <strong>{formatNumber(selectedAccount.points)} 积分</strong>
                <span>冻结积分</span>
                <strong>{formatNumber(selectedAccount.frozen_points)} 积分</strong>
                <span>总积分</span>
                <strong>{formatNumber(selectedAccount.total_points)} 积分</strong>
              </div>

              <div className="adjust-box">
                <h3>手动调整</h3>
                <input
                  type="number"
                  value={adjustPoints}
                  onChange={(event) => setAdjustPoints(event.target.value)}
                  placeholder="正数加分，负数扣分"
                />
                <textarea
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder="原因（可选）"
                  rows="3"
                />
                <button
                  className="primary-action"
                  onClick={handleAdjust}
                  disabled={!selectedAccount.bilibili_uid}
                >
                  保存调整
                </button>
              </div>

              <div className="transaction-list">
                <div className="transaction-list-title">
                  <h3>最近流水</h3>
                  <button type="button" onClick={openTransactionDetails}>
                    查看全部明细
                  </button>
                </div>
                {txLoading ? (
                  <p className="points-empty">加载中...</p>
                ) : transactions.length === 0 ? (
                  <p className="points-empty">暂无流水</p>
                ) : transactions.map(tx => {
                  const display = getTransactionDisplay(tx);
                  const delta = Number(tx.points_delta || 0);

                  return (
                    <div key={tx.id} className="transaction-item">
                      <div className="transaction-item-top">
                        <div>
                          <strong>{SOURCE_LABELS[tx.source] || tx.source}</strong>
                          <span>{formatDateTime(tx.created_at)}</span>
                          <span>{getTransactionAccountLabel(tx)}</span>
                        </div>
                        <div className={delta >= 0 ? 'delta-plus' : 'delta-minus'}>
                          {display.deltaText}
                        </div>
                      </div>
                      {tx.reason && <p>{tx.reason}</p>}
                      <div className="transaction-item-meta">
                        <small>{display.balanceText}</small>
                        {tx.operator_name && <small>操作人：{tx.operator_name}</small>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="detail-placeholder">选择一个 UID 查看流水和调整积分</div>
          )}
        </aside>
      </div>

      {transactionDetailOpen && selectedAccount && (
        <div className="transaction-modal-backdrop" role="presentation" onClick={closeTransactionDetails}>
          <div
            className="transaction-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="transaction-modal-header">
              <div>
                <h2 id="transaction-modal-title">积分变动明细</h2>
                <span>{selectedAccount.bilibili_uname || '未登记昵称'}</span>
                <span>钱包 #{selectedAccount.wallet_id || '-'} / 主UID {selectedAccount.primary_bilibili_uid || selectedAccount.bilibili_uid || '无'}</span>
              </div>
              <button type="button" onClick={closeTransactionDetails}>关闭</button>
            </div>

            <form className="transaction-filter-form" onSubmit={handleDetailFilterSubmit}>
              <label>
                <span>开始日期</span>
                <input
                  type="date"
                  value={detailDraftFilters.start_date}
                  onChange={(event) => handleDetailFilterChange('start_date', event.target.value)}
                />
              </label>
              <label>
                <span>结束日期</span>
                <input
                  type="date"
                  value={detailDraftFilters.end_date}
                  onChange={(event) => handleDetailFilterChange('end_date', event.target.value)}
                />
              </label>
              <label>
                <span>来源</span>
                <select
                  value={detailDraftFilters.source}
                  onChange={(event) => handleDetailFilterChange('source', event.target.value)}
                >
                  <option value="all">全部来源</option>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>方向</span>
                <select
                  value={detailDraftFilters.direction}
                  onChange={(event) => handleDetailFilterChange('direction', event.target.value)}
                >
                  <option value="all">全部</option>
                  <option value="gain">加分</option>
                  <option value="spend">扣分</option>
                </select>
              </label>
              <label className="transaction-keyword">
                <span>关键词</span>
                <input
                  type="search"
                  value={detailDraftFilters.keyword}
                  onChange={(event) => handleDetailFilterChange('keyword', event.target.value)}
                  placeholder="UID / 昵称 / 原因"
                />
              </label>
              <div className="transaction-filter-actions">
                <button type="submit" className="primary-action" disabled={detailLoading}>
                  筛选
                </button>
                <button type="button" className="secondary-action" onClick={handleDetailFilterReset} disabled={detailLoading}>
                  清空
                </button>
              </div>
            </form>

            <div className="transaction-modal-body">
              {detailLoading ? (
                <p className="points-empty">加载中...</p>
              ) : detailTransactions.length === 0 ? (
                <p className="points-empty">暂无匹配流水</p>
              ) : (
                <div className="transaction-table-wrap">
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>来源</th>
                        <th>账号</th>
                        <th>变动</th>
                        <th>余额</th>
                        <th>原因</th>
                        <th>操作人</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailTransactions.map(tx => {
                        const display = getTransactionDisplay(tx);
                        const delta = Number(tx.points_delta || 0);

                        return (
                          <tr key={tx.id}>
                            <td>{formatDateTime(tx.created_at)}</td>
                            <td>{SOURCE_LABELS[tx.source] || tx.source}</td>
                            <td>{getTransactionAccountLabel(tx)}</td>
                            <td className={delta >= 0 ? 'delta-plus-cell' : 'delta-minus-cell'}>
                              {display.deltaText}
                            </td>
                            <td>{display.balanceText}</td>
                            <td>{tx.reason || '-'}</td>
                            <td>{tx.operator_name || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="transaction-modal-footer">
              <span>
                第 {detailPagination.page || 1} / {detailPagination.totalPages || 1} 页，
                共 {detailPagination.total || 0} 条
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => loadDetailPage((detailPagination.page || 1) - 1)}
                  disabled={detailLoading || (detailPagination.page || 1) <= 1}
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => loadDetailPage((detailPagination.page || 1) + 1)}
                  disabled={detailLoading || (detailPagination.page || 1) >= (detailPagination.totalPages || 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPoints;
