/* ═══════════════════════════════════════════════════════════════════════════
   LINK PULSE — API Communication Module
   ═══════════════════════════════════════════════════════════════════════════ */

const API = {
  BASE_URL: '',
  adminToken: localStorage.getItem('linkpulse_admin_token') || '',

  setToken(token) {
    this.adminToken = token;
    localStorage.setItem('linkpulse_admin_token', token);
  },

  clearToken() {
    this.adminToken = '';
    localStorage.removeItem('linkpulse_admin_token');
  },

  async request(endpoint, options = {}) {
    const url = `${this.BASE_URL}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (this.adminToken) {
      headers['x-admin-token'] = this.adminToken;
    }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  },

  // ── Links ───────────────────────────────────────────────────────────────
  async createLink(linkData) {
    return this.request('/api/links', {
      method: 'POST',
      body: JSON.stringify(linkData),
    });
  },

  async getLinks(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.tag) query.set('tag', params.tag);
    const qs = query.toString();
    return this.request(`/api/links${qs ? '?' + qs : ''}`);
  },

  async getLink(id) {
    return this.request(`/api/links/${id}`);
  },

  async updateLink(id, data) {
    return this.request(`/api/links/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteLink(id) {
    return this.request(`/api/links/${id}`, { method: 'DELETE' });
  },

  async getLinkClicks(id) {
    return this.request(`/api/links/${id}/clicks`);
  },

  async getQRCode(id) {
    return this.request(`/api/links/${id}/qr`);
  },

  async reportLink(id) {
    return this.request(`/api/links/${id}/report`, { method: 'POST' });
  },

  async verifyPassword(code, password) {
    return this.request(`/api/links/${code}/verify-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  },

  // ── Analytics ───────────────────────────────────────────────────────────
  async getSummary() {
    return this.request('/api/analytics/summary');
  },

  async getSummaryPublic() {
    const response = await fetch(`${this.BASE_URL}/api/analytics/summary-public`);
    return response.json();
  },

  async getClicksByDate(params = {}) {
    const query = new URLSearchParams();
    if (params.link_id) query.set('link_id', params.link_id);
    if (params.days) query.set('days', params.days);
    const qs = query.toString();
    return this.request(`/api/analytics/clicks-by-date${qs ? '?' + qs : ''}`);
  },
};
