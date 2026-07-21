import api from './api';

const pointsService = {
  async getSummary() {
    const response = await api.get('/points/summary');
    return response.data;
  },

  async getTransactions(page = 1, limit = 20, filters = {}) {
    const response = await api.get('/points/transactions', {
      params: { page, limit, ...filters }
    });
    return response.data;
  },

  async getAdminAccounts(page = 1, limit = 20, search = '') {
    const response = await api.get('/points/admin/accounts', {
      params: { page, limit, search }
    });
    return response.data;
  },

  async createAdminAccount(bilibiliUid, bilibiliUname = '') {
    const response = await api.post('/points/admin/accounts', {
      bilibili_uid: bilibiliUid,
      bilibili_uname: bilibiliUname
    });
    return response.data;
  },

  async refreshAdminAccountProfiles(bilibiliUids = [], refreshAll = false) {
    const response = await api.post('/points/admin/accounts/refresh-names', {
      bilibili_uids: bilibiliUids,
      refresh_all: refreshAll
    });
    return response.data;
  },

  async getAdminAccountTransactions(bilibiliUid, page = 1, limit = 20, filters = {}) {
    const response = await api.get(`/points/admin/accounts/${bilibiliUid}/transactions`, {
      params: { page, limit, ...filters }
    });
    return response.data;
  },

  async getAdminWalletTransactions(walletId, page = 1, limit = 20, filters = {}) {
    const response = await api.get(`/points/admin/wallets/${walletId}/transactions`, {
      params: { page, limit, ...filters }
    });
    return response.data;
  },

  async adjustAccountPoints(bilibiliUid, pointsDelta, reason = '') {
    const response = await api.post(`/points/admin/accounts/${bilibiliUid}/adjust`, {
      points_delta: pointsDelta,
      reason
    });
    return response.data;
  },

  async previewImport(csv) {
    const response = await api.post('/points/admin/import/preview', { csv });
    return response.data;
  },

  async commitImport(csv, reason = '') {
    const response = await api.post('/points/admin/import/commit', { csv, reason });
    return response.data;
  },

  async settle() {
    const response = await api.post('/points/admin/settle');
    return response.data;
  },

  async mergeAllFrozen() {
    const response = await api.post('/points/admin/frozen/merge-all');
    return response.data;
  },

  async exportCsv(type = 'accounts', search = '') {
    const response = await api.get('/points/admin/export', {
      params: { type, search },
      responseType: 'blob'
    });

    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `points-${type}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
};

export default pointsService;
