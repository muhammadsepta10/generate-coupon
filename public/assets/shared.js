/* ────────────────────────────────────────────────────────────
   shared.js  –  Common utilities for all dashboard pages
   ──────────────────────────────────────────────────────────── */

const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

/* ── Toast Notifications ─────────────────────────────────── */
(() => {
  const c = document.createElement('div');
  c.className = 'toast-container';
  document.body.appendChild(c);
})();

function toast(message, type = 'info') {
  const c = $('.toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

/* ── API Fetch Helper ────────────────────────────────────── */
async function apiFetch(url, options = {}) {
  const defaultHeaders = { 'Content-Type': 'application/json' };
  // If body is FormData, let browser set Content-Type (multipart boundary)
  if (options.body instanceof FormData) {
    delete defaultHeaders['Content-Type'];
  }
  const config = {
    method: 'GET',
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  };
  const response = await fetch(url, config);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) return response.json().then(data=>data)
  return response
}

/* ── Utility ─────────────────────────────────────────────── */
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

function toPublicUrl(path) {
  if (!path) return '';
  const t = path.trim();
  if (t.startsWith('data:')) return t;
  return t.replace(/^\.?\/?public\/?/, '/');
}

function fmtNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('en-US');
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return '-';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d < 7) return `${d}d ${rh}h`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    const rd = d % 7;
    return `${w}w ${rd}d`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    const rd = d % 30;
    return `${mo}mo ${rd}d`;
  }
  const y = Math.floor(d / 365);
  const rmo = Math.floor((d % 365) / 30);
  return `${y}y ${rmo}mo`;
}

/* ────────────────────────────────────────────────────────────
   Socket.IO Manager
   ──────────────────────────────────────────────────────────── */
class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();   // event -> Set<fn>
    this.connected = false;
    this._init();
  }

  _init() {
    if (typeof io === 'undefined') {
      console.warn('[SocketManager] socket.io client not loaded');
      return;
    }
    this.socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this._updateDot();
      console.log('[WS] connected', this.socket.id);
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this._updateDot();
      console.log('[WS] disconnected');
    });

    // Forward all known server events
    ['job:progress', 'job:complete', 'job:failed'].forEach(ev => {
      this.socket.on(ev, (data) => this._dispatch(ev, data));
    });
  }

  _updateDot() {
    const dot = $('.nav-status .dot');
    if (dot) dot.classList.toggle('connected', this.connected);
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }

  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }

  _dispatch(event, data) {
    this.listeners.get(event)?.forEach(fn => fn(data));
  }
}

// Singleton
const socketManager = new SocketManager();

/* ────────────────────────────────────────────────────────────
   Job Tracker  – tracks active / recent jobs, renders cards
   Options:
     containerSelector  – CSS selector for the container element
     queueFilter        – array of queue names to show (null = show all)
   ──────────────────────────────────────────────────────────── */
class JobTracker {
  constructor(containerSelector, { queueFilter = null } = {}) {
    this.container = $(containerSelector);
    this.queueFilter = queueFilter;  // e.g. ['coupon2','coupon'] or null for all
    this.jobs = new Map();  // jobId -> { queue, progress, total, pct, speed, status, eta, startedAt, ... }

    socketManager.on('job:progress', (d) => this._onProgress(d));
    socketManager.on('job:complete', (d) => this._onComplete(d));
    socketManager.on('job:failed', (d) => this._onFailed(d));
  }

  /** Check if a queue name passes the filter */
  _matchesFilter(queue) {
    if (!this.queueFilter) return true;
    return this.queueFilter.includes(queue);
  }

  _onProgress(d) {
    if (!this._matchesFilter(d.queue)) return;
    const key = d.jobId ?? d.parentJobId ?? 'unknown';
    const existing = this.jobs.get(key) || { status: 'active', startedAt: Date.now() };
    this.jobs.set(key, {
      ...existing,
      queue: d.queue || existing.queue || '',
      progress: d.processed ?? d.progress ?? 0,
      total: d.total ?? existing.total ?? 0,
      pct: d.pct ?? d.percent ?? 0,
      speed: d.speed ?? existing.speed ?? '',
      eta: d.eta || existing.eta || '',
      status: 'active',
      label: d.project || d.label || existing.label || key,
    });
    this._render();
  }

  _onComplete(d) {
    if (!this._matchesFilter(d.queue)) return;
    const key = d.jobId ?? d.parentJobId ?? 'unknown';
    const existing = this.jobs.get(key) || {};
    this.jobs.set(key, {
      ...existing,
      queue: d.queue || existing.queue || '',
      pct: 100,
      status: 'completed',
      eta: '',
      label: d.project || d.label || existing.label || key,
    });
    this._render();
    // Remove completed after 30s
    setTimeout(() => { this.jobs.delete(key); this._render(); }, 30000);
  }

  _onFailed(d) {
    if (!this._matchesFilter(d.queue)) return;
    const key = d.jobId ?? d.parentJobId ?? 'unknown';
    const existing = this.jobs.get(key) || {};
    this.jobs.set(key, {
      ...existing,
      queue: d.queue || existing.queue || '',
      status: 'failed',
      error: d.error || '',
      eta: '',
      label: d.project || d.label || existing.label || key,
    });
    this._render();
    setTimeout(() => { this.jobs.delete(key); this._render(); }, 60000);
  }

  async loadActive() {
    try {
      const res = await apiFetch('/api/coupon/jobs/active');
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      list.forEach(j => {
        if (!this._matchesFilter(j.queue)) return;
        const key = j.jobId || j.parentJobId || j.id;
        if (!this.jobs.has(key)) {
          this.jobs.set(key, {
            queue: j.queue || '',
            progress: j.processed ?? 0,
            total: j.total ?? 0,
            pct: j.pct ?? j.percentage ?? 0,
            speed: j.speed ?? '',
            eta: j.eta || '',
            status: j.status || 'active',
            label: j.label || j.jobType || key,
            startedAt: j.timestamp || Date.now(),
          });
        }
      });
    } catch (e) {
      // silent
    }
    this._render();
  }

  _render() {
    if (!this.container) return;
    if (this.jobs.size === 0) {
      this.container.innerHTML = '<div class="jobs-empty">No active jobs</div>';
      return;
    }
    let html = '';
    for (const [key, j] of this.jobs) {
      const pct = Math.min(j.pct || 0, 100);
      const fillClass = j.status === 'completed' ? 'completed' : j.status === 'failed' ? 'failed' : '';
      const statsHtml = [];
      if (j.progress != null && j.total) statsHtml.push(`<span>Progress: <span class="value">${fmtNumber(j.progress)} / ${fmtNumber(j.total)}</span></span>`);
      if (j.speed) statsHtml.push(`<span>Speed: <span class="value">${typeof j.speed === 'number' ? fmtNumber(j.speed) + '/s' : j.speed}</span></span>`);
      if (j.eta) statsHtml.push(`<span>ETA: <span class="value">${j.eta}</span></span>`);
      if (j.status === 'failed' && j.error) statsHtml.push(`<span style="color:var(--error)">Error: ${j.error}</span>`);

      html += `
        <div class="progress-card" data-job="${key}">
          <div class="progress-header">
            <span class="job-type">${j.label || key}</span>
            <span class="job-queue">${j.queue || 'queue'}</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill ${fillClass}" style="width: ${pct}%"></div>
            <div class="progress-bar-text">${pct.toFixed(1)}%</div>
          </div>
          <div class="progress-stats">${statsHtml.join('')}</div>
        </div>`;
    }
    this.container.innerHTML = html;
  }
}

/* ────────────────────────────────────────────────────────────
   Navigation – highlights the active page
   ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  $$('.nav-links a').forEach(a => {
    const href = a.getAttribute('href')?.replace(/\/$/, '') || '/';
    if (href === currentPath) a.classList.add('active');
  });
});
