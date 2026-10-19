/* ═══════════════════════════════════════════════════════════════════════════
   LINK PULSE — Landing Page Interactions
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

  // ── Navbar Scroll Effect ────────────────────────────────────────────────
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  // ── Mobile Menu ─────────────────────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');

  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  mobileMenu.querySelectorAll('[data-close-menu]').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // ── Smooth Scroll ──────────────────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ── Intersection Observer — Fade-in Animations ─────────────────────────
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));

  // ── Counter Animation ──────────────────────────────────────────────────
  function animateCounter(element, target, suffix = '') {
    const duration = 1500;
    const start = performance.now();
    const initial = 0;

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(initial + (target - initial) * eased);
      element.textContent = current.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Observe stats section
  const statsSection = document.getElementById('stats');
  let statsAnimated = false;
  const statsObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !statsAnimated) {
      statsAnimated = true;
      loadPublicStats();
    }
  }, { threshold: 0.3 });
  if (statsSection) statsObserver.observe(statsSection);

  // ── Load Public Stats ──────────────────────────────────────────────────
  async function loadPublicStats() {
    try {
      const data = await API.getSummaryPublic();
      animateCounter(document.getElementById('statLinks'), data.totalLinks || 0);
      animateCounter(document.getElementById('statClicks'), data.totalClicks || 0);
    } catch {
      // Silently fall back to zeros
    }
  }

  // ── URL Shortener Form ─────────────────────────────────────────────────
  let lastCreatedLink = null;
  const form = document.getElementById('shortenerForm');
  const urlInput = document.getElementById('urlInput');
  const shortenBtn = document.getElementById('shortenBtn');
  const shortenBtnText = document.getElementById('shortenBtnText');
  const shortenSpinner = document.getElementById('shortenSpinner');
  const resultDiv = document.getElementById('shortenerResult');
  const resultUrl = document.getElementById('resultUrl');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const url = urlInput.value.trim();

    if (!url) { showToast('Please enter a URL', 'error'); return; }
    if (!isValidUrl(url)) { showToast('Please enter a valid URL (http:// or https://)', 'error'); return; }

    // Loading state
    shortenBtn.disabled = true;
    shortenBtnText.style.display = 'none';
    shortenSpinner.style.display = 'block';

    try {
      const link = await API.createLink({ url });
      lastCreatedLink = link;
      resultUrl.textContent = link.short_url;
      document.getElementById('openLink').href = link.short_url;
      resultDiv.classList.add('active');
      showToast('Link shortened successfully!', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to shorten URL', 'error');
    } finally {
      shortenBtn.disabled = false;
      shortenBtnText.style.display = 'inline';
      shortenSpinner.style.display = 'none';
    }
  });

  function isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch { return false; }
  }

  // ── Copy Button ────────────────────────────────────────────────────────
  document.getElementById('copyBtn').addEventListener('click', async () => {
    const url = resultUrl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Copied to clipboard!', 'success');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copied to clipboard!', 'success');
    }
  });

  // ── QR Code Button ─────────────────────────────────────────────────────
  const qrModal = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const qrUrl = document.getElementById('qrUrl');

  document.getElementById('qrBtn').addEventListener('click', async () => {
    if (!lastCreatedLink) return;
    try {
      const data = await API.getQRCode(lastCreatedLink.id);
      qrImage.src = data.qr;
      qrUrl.textContent = data.url;
      qrModal.classList.add('active');
    } catch (err) {
      showToast(err.message || 'Failed to generate QR', 'error');
    }
  });

  // Download QR
  document.getElementById('downloadQr').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'linkpulse-qr.png';
    link.href = qrImage.src;
    link.click();
  });

  // ── Share Button ───────────────────────────────────────────────────────
  document.getElementById('shareBtn').addEventListener('click', async () => {
    const url = resultUrl.textContent;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Link Pulse', url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      showToast('Link copied for sharing!', 'success');
    }
  });

  // ── Modal Close ────────────────────────────────────────────────────────
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('active');
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
  });

})();
