/* ═══════════════════════════════════════════════════════════════════════════
   LINK PULSE — Dashboard Controller
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Toast System ────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Utilities ───────────────────────────────────────────────────────────
  function truncateUrl(url, max = 55) {
    if (!url) return '';
    return url.length > max ? url.slice(0, max) + '…' : url;
  }

  function relativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
    const diff = (now - date) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  function getLinkStatus(link) {
    if (link.is_suspicious) return 'suspicious';
    if (!link.is_active) return 'disabled';
    if (link.expires_at && new Date(link.expires_at) <= new Date()) return 'expired';
    return 'active';
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  const authOverlay = document.getElementById('authOverlay');
  const appEl = document.getElementById('app');
  const authForm = document.getElementById('authForm');
  const authError = document.getElementById('authError');

  function checkAuth() {
    if (API.adminToken) {
      authOverlay.style.display = 'none';
      appEl.style.display = 'grid';
      loadDashboard();
    }
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('authPassword').value;
    const btn = authForm.querySelector('button');
    const btnText = document.getElementById('authBtnText');
    const spinner = document.getElementById('authSpinner');

    btn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';
    authError.style.display = 'none';

    API.setToken(password);
    try {
      await API.getSummary();
      authOverlay.style.display = 'none';
      appEl.style.display = 'grid';
      loadDashboard();
    } catch {
      API.clearToken();
      authError.textContent = 'Invalid password. Please try again.';
      authError.style.display = 'block';
    } finally {
      btn.disabled = false;
      btnText.style.display = 'inline';
      spinner.style.display = 'none';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    API.clearToken();
    authOverlay.style.display = 'flex';
    appEl.style.display = 'none';
    document.getElementById('authPassword').value = '';
  });

  // ── Navigation ──────────────────────────────────────────────────────────
  const navItems = document.querySelectorAll('[data-view]');
  const viewSections = document.querySelectorAll('.view-section');

  function switchView(viewName) {
    navItems.forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    viewSections.forEach(section => section.classList.toggle('active', section.id === viewName + 'View'));
    if (viewName === 'links') loadLinks();
    if (viewName === 'overview') loadOverview();
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.nav));
  });

  // Sidebar toggle (mobile)
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // ── Dashboard Load ─────────────────────────────────────────────────────
  let trendChart = null;
  let refreshInterval = null;

  async function loadDashboard() {
    await loadOverview();
    refreshInterval = setInterval(loadOverview, 30000);
  }

  async function loadOverview() {
    try {
      const summary = await API.getSummary();
      document.getElementById('dashTotalLinks').textContent = summary.totalLinks.toLocaleString();
      document.getElementById('dashTotalClicks').textContent = summary.totalClicks.toLocaleString();
      document.getElementById('dashActiveLinks').textContent = summary.activeLinks.toLocaleString();
      document.getElementById('dashSuspicious').textContent = summary.suspiciousLinks.toLocaleString();

      // Top links
      renderTopLinks(summary.topLinks || []);
    } catch (err) {
      showToast('Failed to load dashboard data', 'error');
    }

    // Load chart
    try {
      const clickData = await API.getClicksByDate({ days: 30 });
      renderTrendChart(clickData);
    } catch { /* silent */ }
  }

  function renderTopLinks(links) {
    const container = document.getElementById('topLinksList');
    if (!links.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No links yet. Create your first link!</p></div>';
      return;
    }
    container.innerHTML = links.map(l => `
      <div class="top-link-item">
        <div class="top-link-info">
          <div class="top-link-title">${l.title || l.custom_alias || l.short_code}</div>
          <div class="top-link-url">${truncateUrl(l.original_url, 60)}</div>
        </div>
        <div class="top-link-clicks">${l.click_count} clicks</div>
      </div>
    `).join('');
  }

  function renderTrendChart(data) {
    const ctx = document.getElementById('clickTrendChart');
    if (!ctx) return;

    // Fill in missing dates
    const labels = [];
    const counts = [];
    const map = {};
    data.forEach(d => { map[d.date] = d.count; });
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
      counts.push(map[key] || 0);
    }

    if (trendChart) trendChart.destroy();

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(108, 92, 231, 0.3)');
    gradient.addColorStop(1, 'rgba(108, 92, 231, 0)');

    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Clicks',
          data: counts,
          borderColor: '#6C5CE7',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#6C5CE7',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#2a2a4a' }, ticks: { color: '#A0A0B8', maxTicksLimit: 8 } },
          y: { grid: { color: '#2a2a4a' }, ticks: { color: '#A0A0B8', beginAtZero: true }, beginAtZero: true },
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
      },
    });
  }

  // ── Links View ──────────────────────────────────────────────────────────
  let allLinks = [];

  async function loadLinks() {
    const container = document.getElementById('linksList');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading links…</span></div>';

    try {
      const search = document.getElementById('linkSearch').value;
      const status = document.getElementById('statusFilter').value;
      const tag = document.getElementById('tagFilter').value;

      allLinks = await API.getLinks({ search, status, tag });
      renderLinks(allLinks);
      populateTagFilter(allLinks);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderLinks(links) {
    const container = document.getElementById('linksList');
    if (!links.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h3>No Links Found</h3>
          <p>Create your first short link to get started.</p>
          <button class="btn btn-primary" data-nav="create" onclick="document.querySelector('[data-view=create]').click()">➕ Create Link</button>
        </div>`;
      return;
    }

    container.innerHTML = links.map(link => {
      const status = getLinkStatus(link);
      return `
        <div class="link-card" data-id="${link.id}">
          <div class="link-status-dot ${status}" title="${status}"></div>
          <div class="link-info">
            <a class="link-short-url" href="${link.short_url}" target="_blank" rel="noopener">${link.short_url}</a>
            <span class="link-original-url" title="${link.original_url}">${truncateUrl(link.original_url)}</span>
            <div class="link-meta">
              <span class="link-meta-item">👆 ${link.click_count} clicks</span>
              <span class="link-meta-item">🕐 ${relativeTime(link.created_at)}</span>
              ${link.campaign_tag ? `<span class="link-tag">${link.campaign_tag}</span>` : ''}
              ${link.password_hash ? '<span class="link-meta-item">🔒</span>' : ''}
              ${link.click_limit ? `<span class="link-meta-item">📊 ${link.click_count}/${link.click_limit}</span>` : ''}
              ${link.expires_at ? `<span class="link-meta-item">⏰ ${new Date(link.expires_at).toLocaleDateString()}</span>` : ''}
            </div>
          </div>
          <div class="link-actions">
            <button class="btn-icon" title="Copy" data-action="copy" data-url="${link.short_url}">📋</button>
            <button class="btn-icon" title="Edit" data-action="edit" data-id="${link.id}">✏️</button>
            <button class="btn-icon" title="QR Code" data-action="qr" data-id="${link.id}">📱</button>
            <button class="btn-icon" title="Analytics" data-action="detail" data-id="${link.id}">📊</button>
            <button class="btn-icon" title="Report" data-action="report" data-id="${link.id}">🚩</button>
            <button class="btn-icon" title="Delete" data-action="delete" data-id="${link.id}" style="color:var(--error)">🗑️</button>
          </div>
        </div>`;
    }).join('');

    // Attach action handlers
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleLinkAction(btn.dataset.action, btn.dataset.id, btn.dataset.url));
    });
  }

  function populateTagFilter(links) {
    const select = document.getElementById('tagFilter');
    const current = select.value;
    const tags = [...new Set(links.map(l => l.campaign_tag).filter(Boolean))];
    select.innerHTML = '<option value="">All Tags</option>' + tags.map(t => `<option value="${t}" ${t === current ? 'selected' : ''}>${t}</option>`).join('');
  }

  // Search & filters
  document.getElementById('linkSearch').addEventListener('input', debounce(loadLinks, 350));
  document.getElementById('statusFilter').addEventListener('change', loadLinks);
  document.getElementById('tagFilter').addEventListener('change', loadLinks);

  // ── Link Actions ────────────────────────────────────────────────────────
  async function handleLinkAction(action, id, url) {
    switch (action) {
      case 'copy':
        try {
          await navigator.clipboard.writeText(url);
          showToast('Copied to clipboard!', 'success');
        } catch {
          showToast('Failed to copy', 'error');
        }
        break;

      case 'edit':
        openEditModal(parseInt(id));
        break;

      case 'qr':
        openQRModal(parseInt(id));
        break;

      case 'detail':
        openDetailModal(parseInt(id));
        break;

      case 'report':
        if (confirm('Report this link as suspicious?')) {
          try {
            await API.reportLink(parseInt(id));
            showToast('Link reported as suspicious', 'success');
            loadLinks();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
        break;

      case 'delete':
        if (confirm('Delete this link permanently? This cannot be undone.')) {
          try {
            await API.deleteLink(parseInt(id));
            showToast('Link deleted', 'success');
            loadLinks();
            loadOverview();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
        break;
    }
  }

  // ── Edit Modal ──────────────────────────────────────────────────────────
  async function openEditModal(id) {
    try {
      const link = await API.getLink(id);
      document.getElementById('editId').value = link.id;
      document.getElementById('editTitle').value = link.title || '';
      document.getElementById('editTag').value = link.campaign_tag || '';
      document.getElementById('editActive').value = link.is_active ? '1' : '0';
      document.getElementById('editClickLimit').value = link.click_limit || '';
      document.getElementById('editExpiry').value = link.expires_at ? link.expires_at.slice(0, 16) : '';
      document.getElementById('editPassword').value = '';
      document.getElementById('editModal').classList.add('active');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const data = {
      title: document.getElementById('editTitle').value || null,
      campaign_tag: document.getElementById('editTag').value || null,
      is_active: parseInt(document.getElementById('editActive').value),
      click_limit: document.getElementById('editClickLimit').value ? parseInt(document.getElementById('editClickLimit').value) : null,
      expires_at: document.getElementById('editExpiry').value || null,
    };
    const pw = document.getElementById('editPassword').value;
    if (pw) data.password = pw;

    try {
      await API.updateLink(id, data);
      showToast('Link updated successfully', 'success');
      document.getElementById('editModal').classList.remove('active');
      loadLinks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ── QR Modal ────────────────────────────────────────────────────────────
  async function openQRModal(id) {
    try {
      const data = await API.getQRCode(id);
      document.getElementById('dashQrImage').src = data.qr;
      document.getElementById('dashQrUrl').textContent = data.url;
      document.getElementById('dashQrModal').classList.add('active');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  document.getElementById('dashDownloadQr').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'linkpulse-qr.png';
    link.href = document.getElementById('dashQrImage').src;
    link.click();
  });

  // ── Detail Modal ────────────────────────────────────────────────────────
  let detailChart = null;

  async function openDetailModal(id) {
    try {
      const link = await API.getLink(id);
      const clicks = await API.getLinkClicks(id);
      const clickTrend = await API.getClicksByDate({ link_id: id, days: 14 });

      document.getElementById('detailTitle').textContent = link.title || link.short_code;

      const status = getLinkStatus(link);
      document.getElementById('detailStats').innerHTML = `
        <div class="detail-stat"><div class="detail-stat-value">${link.click_count}</div><div class="detail-stat-label">Total Clicks</div></div>
        <div class="detail-stat"><div class="detail-stat-value" style="color:var(--${status === 'active' ? 'success' : status === 'expired' ? 'error' : 'warning'})">${status}</div><div class="detail-stat-label">Status</div></div>
      `;

      // Chart
      const ctx = document.getElementById('detailChart');
      if (detailChart) detailChart.destroy();

      const labels = [];
      const counts = [];
      const map = {};
      clickTrend.forEach(d => { map[d.date] = d.count; });
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
        counts.push(map[key] || 0);
      }

      detailChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Clicks', data: counts, backgroundColor: 'rgba(108,92,231,0.6)', borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#A0A0B8', maxTicksLimit: 7 } },
            y: { grid: { color: '#2a2a4a' }, ticks: { color: '#A0A0B8' }, beginAtZero: true },
          },
        },
      });

      // Click list
      const clickList = document.getElementById('detailClickList');
      if (!clicks.length) {
        clickList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:1rem">No clicks recorded yet.</p>';
      } else {
        clickList.innerHTML = clicks.slice(0, 50).map(c => `
          <div class="click-item">
            <span>${relativeTime(c.clicked_at)}</span>
            <span>${c.referrer ? truncateUrl(c.referrer, 30) : 'Direct'}</span>
          </div>
        `).join('');
      }

      document.getElementById('detailModal').classList.add('active');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Create Link ─────────────────────────────────────────────────────────
  const createForm = document.getElementById('createLinkForm');
  const enablePassword = document.getElementById('enablePassword');
  const createPasswordField = document.getElementById('createPassword');
  let lastCreatedId = null;

  enablePassword.addEventListener('change', () => {
    createPasswordField.style.display = enablePassword.checked ? 'block' : 'none';
    if (!enablePassword.checked) createPasswordField.value = '';
  });

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('createBtn');
    const btnText = document.getElementById('createBtnText');
    const spinner = document.getElementById('createSpinner');

    btn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';

    const data = { url: document.getElementById('createUrl').value.trim() };
    const alias = document.getElementById('createAlias').value.trim();
    if (alias) data.custom_alias = alias;
    const title = document.getElementById('createTitle').value.trim();
    if (title) data.title = title;
    const tag = document.getElementById('createTag').value.trim();
    if (tag) data.campaign_tag = tag;
    if (enablePassword.checked && createPasswordField.value) {
      data.password = createPasswordField.value;
    }
    const limit = document.getElementById('createClickLimit').value;
    if (limit) data.click_limit = parseInt(limit);
    const expiry = document.getElementById('createExpiry').value;
    if (expiry) data.expires_at = expiry;

    try {
      const link = await API.createLink(data);
      lastCreatedId = link.id;
      document.getElementById('createResultUrl').textContent = link.short_url;
      document.getElementById('createResult').classList.add('active');
      showToast('Link created successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to create link', 'error');
    } finally {
      btn.disabled = false;
      btnText.style.display = 'inline';
      spinner.style.display = 'none';
    }
  });

  document.getElementById('createCopyBtn').addEventListener('click', async () => {
    const url = document.getElementById('createResultUrl').textContent;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Copied!', 'success');
    } catch { showToast('Failed to copy', 'error'); }
  });

  document.getElementById('createQrBtn').addEventListener('click', () => {
    if (lastCreatedId) openQRModal(lastCreatedId);
  });

  document.getElementById('createAnotherBtn').addEventListener('click', () => {
    createForm.reset();
    document.getElementById('createResult').classList.remove('active');
    createPasswordField.style.display = 'none';
    enablePassword.checked = false;
    lastCreatedId = null;
  });

  // ── Modal Close ─────────────────────────────────────────────────────────
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.remove('active'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

  // ── Init ────────────────────────────────────────────────────────────────
  checkAuth();

})();
