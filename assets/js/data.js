/* ============================================================
   資料層 —— 香港巴士路線／車站
   資料來源（政府公開資料，免授權、支援 CORS）：
     九巴／龍運  https://data.etabus.gov.hk/v1/transport/kmb
     城巴／新巴  https://rt.data.gov.hk/v1/transport/citybus-nwfb
   車站全表以 IndexedDB 快取 7 天；網路失敗時自動退回內建路線
   （assets/js/routes.js），離線也能玩。
   ============================================================ */

const Data = (() => {
  const KMB_API = 'https://data.etabus.gov.hk/v1/transport/kmb';
  const CTB_API = 'https://rt.data.gov.hk/v1/transport/citybus-nwfb';
  const CACHE_MS = 7 * 24 * 3600 * 1000;

  /* ---------------- 小工具 ---------------- */
  async function getJSON(url, ms = 12000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return (j && j.data) || [];
    } finally { clearTimeout(timer); }
  }

  function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
      while (i < arr.length) {
        const k = i++;
        try { out[k] = await fn(arr[k], k); } catch (e) { out[k] = null; }
      }
    });
    return Promise.all(workers).then(() => out);
  }

  /* ---------------- IndexedDB 快取 ---------------- */
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      try {
        const req = indexedDB.open('hkbus-ann', 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }

  async function cacheGet(key) {
    try {
      const db = await idb(); if (!db) return null;
      return await new Promise(res => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }

  async function cacheSet(key, val) {
    try {
      const db = await idb(); if (!db) return;
      await new Promise(res => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      });
    } catch (e) { /* 快取失敗不影響主流程 */ }
  }

  async function useCache(key, loader) {
    const c = await cacheGet(key);
    if (c && c.at && Date.now() - c.at < CACHE_MS && c.data) return c.data;
    const data = await loader();
    if (data && data.length) await cacheSet(key, { at: Date.now(), data });
    return data || [];
  }

  /* ---------------- 狀態 ---------------- */
  const state = {
    mode: 'loading',        // loading | api | fallback
    msg: '正在載入路線資料…',
    routeIndexReady: false,
    stopsReady: false
  };

  let routeIndex = [];      // 路線索引
  const stops = { KMB: new Map(), CTB: new Map() };
  const routeStopCache = new Map();

  /* ---------------- 路線索引 ---------------- */
  /* 同一路線可能有多個 service_type（01 常規、02/03 特別班次），只保留一筆，01 優先 */
  function dedupe(list, co) {
    const best = new Map();
    for (const r of list) {
      if (!r || !r.route) continue;
      const st = co === 'KMB' ? String(r.service_type || '01') : '01';
      const key = `${r.route}|${r.bound}`;
      const cur = best.get(key);
      if (!cur || (cur.serviceType !== '01' && st === '01')) {
        best.set(key, {
          id: `${co}|${r.route}|${r.bound}|${st}`,
          co, route: r.route, bound: String(r.bound), serviceType: st,
          origTc: r.orig_tc || '', origEn: r.orig_en || '',
          destTc: r.dest_tc || '', destEn: r.dest_en || ''
        });
      }
    }
    return Array.from(best.values());
  }
  const normKMB = list => dedupe(list, 'KMB');
  const normCTB = list => dedupe(list, 'CTB');

  async function loadRouteIndex() {
    const [kmb, ctb] = await Promise.allSettled([
      getJSON(`${KMB_API}/route`, 12000),
      getJSON(`${CTB_API}/route/CTB`, 12000)
    ]);
    const a = kmb.status === 'fulfilled' ? normKMB(kmb.value) : [];
    const b = ctb.status === 'fulfilled' ? normCTB(ctb.value) : [];
    routeIndex = a.concat(b).sort((x, y) => cmpRoute(x.route, y.route));
    state.routeIndexReady = routeIndex.length > 0;
    if (!state.routeIndexReady) throw new Error('無法取得路線資料');
  }

  function cmpRoute(a, b) {
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb || a.localeCompare(b);
    return a.localeCompare(b);
  }

  /* ---------------- 車站全表 ---------------- */
  /* 車站全表路徑在不同時期有不同寫法，逐個試、取第一個成功的 */
  async function tryEach(urls) {
    for (const u of urls) {
      try {
        const d = await getJSON(u, 25000);
        if (d && d.length) return d;
      } catch (e) { /* 換下一個 */ }
    }
    return [];
  }

  async function loadStops() {
    const [k, c] = await Promise.allSettled([
      useCache('stops:KMB', () => tryEach([`${KMB_API}/stop`, `${KMB_API}/stop-list`])),
      useCache('stops:CTB', () => tryEach([`${CTB_API}/stop-list/CTB`, `${CTB_API}/stop-list/ctb`, `${CTB_API}/stop/CTB`]))
    ]);
    if (k.status === 'fulfilled') for (const s of k.value) if (s && s.stop) stops.KMB.set(String(s.stop), s);
    if (c.status === 'fulfilled') for (const s of c.value) if (s && s.stop) stops.CTB.set(String(s.stop), s);
    state.stopsReady = stops.KMB.size + stops.CTB.size > 0;
    if (!state.stopsReady) throw new Error('無法取得車站資料');
  }

  /* ---------------- 內建離線路線 ---------------- */
  function fallbackMeta() {
    return (window.ROUTES || []).map(r => ({
      id: `FB|${r.id}`,
      co: r.operator, route: r.route, bound: '1', serviceType: '01',
      origTc: r.originZh, origEn: r.originEn,
      destTc: r.destZh, destEn: r.destEn,
      _fallback: true
    }));
  }

  function findFallback(id) {
    return (window.ROUTES || []).find(r => `FB|${r.id}` === id);
  }

  /* ---------------- 對外：初始化 ---------------- */
  async function init(onUpdate) {
    const tick = () => onUpdate && onUpdate(state);
    try {
      state.msg = '正在載入路線表…'; tick();
      await loadRouteIndex();
      state.mode = 'api';
      state.msg = `已載入 ${routeIndex.length} 條路線班次，正在載入車站資料…`; tick();
      // 車站全表背景載入，期間使用者可先選路線（缺名會即時補抓）
      loadStops().then(() => {
        state.msg = `已載入 ${routeIndex.length} 條路線班次 · ${stops.KMB.size + stops.CTB.size} 個車站`; tick();
      }).catch(() => {
        state.msg = `已載入 ${routeIndex.length} 條路線班次（車站資料將即用即載）`; tick();
      });
      return state;
    } catch (e) {
      routeIndex = fallbackMeta();
      state.mode = 'fallback';
      state.routeIndexReady = routeIndex.length > 0;
      state.msg = state.routeIndexReady
        ? '網路無法連上政府資料，已切換至內建路線（離線模式）'
        : '資料載入失敗';
      tick();
      return state;
    }
  }

  /* ---------------- 對外：搜尋 ---------------- */
  function search(q, co) {
    let list = routeIndex;
    if (co && co !== 'ALL') list = list.filter(r => r.co === co);
    const s = (q || '').trim().toUpperCase();
    if (!s) return list.slice(0, 60);
    const hit = list.filter(r =>
      r.route.toUpperCase().includes(s) ||
      (r.destTc || '').includes(s) || (r.origTc || '').includes(s) ||
      (r.destEn || '').toUpperCase().includes(s) || (r.origEn || '').toUpperCase().includes(s)
    );
    // 路線編號完全相同優先
    hit.sort((a, b) => (a.route.toUpperCase() === s ? -1 : 0) - (b.route.toUpperCase() === s ? -1 : 0));
    return hit.slice(0, 80);
  }

  function boundLabel(r) {
    if (r._fallback) return '';
    if (r.co === 'KMB') return r.bound === '1' ? '去程' : '回程';
    return r.bound === 'O' ? '去程 Outbound' : '回程 Inbound';
  }

  /** 找同一路線的另一方向 */
  function otherBound(r) {
    if (r._fallback) return null;
    const alt = r.co === 'KMB' ? (r.bound === '1' ? '2' : '1') : (r.bound === 'O' ? 'I' : 'O');
    return routeIndex.find(x => x.co === r.co && x.route === r.route && x.bound === alt) || null;
  }

  function byId(id) { return routeIndex.find(r => r.id === id) || null; }

  /* ---------------- 對外：取路線車站 ---------------- */
  async function getRoute(id, onProgress) {
    const fb = findFallback(id);
    if (fb) return {
      id, co: fb.operator, route: fb.route, boundLabel: '',
      origTc: fb.originZh, origEn: fb.originEn,
      destTc: fb.destZh, destEn: fb.destEn,
      stops: fb.stops.map(s => ({ zh: s.zh, en: s.en, note: s.note || '' }))
    };

    const meta = byId(id);
    if (!meta) throw new Error('找不到路線');
    if (routeStopCache.has(id)) return routeStopCache.get(id);

    onProgress && onProgress('正在載入車站順序…');
    const url = meta.co === 'KMB'
      ? `${KMB_API}/route-stop/${encodeURIComponent(meta.route)}/${meta.bound}/${meta.serviceType}`
      : `${CTB_API}/route-stop/CTB/${encodeURIComponent(meta.route)}/${meta.bound}`;
    const raw = await getJSON(url, 12000);
    if (!raw.length) throw new Error('此班次暫無車站資料');

    const order = raw.slice().sort((a, b) => (+a.seq || 0) - (+b.seq || 0)).map(x => String(x.stop));
    const table = stops[meta.co];

    const missing = order.filter(s => !table.has(s));
    if (missing.length && missing.length <= 160) {
      onProgress && onProgress(`正在補載 ${missing.length} 個站名…`);
      await mapLimit(missing, 12, async sid => {
        try {
          const arr = await getJSON(meta.co === 'KMB' ? `${KMB_API}/stop/${sid}` : `${CTB_API}/stop/${sid}`, 8000);
          if (arr && arr[0]) table.set(sid, arr[0]);
        } catch (e) { /* 留待下面以編號代替 */ }
      });
    }

    const list = order.map(sid => {
      const s = table.get(sid);
      return s ? { zh: s.name_tc || '', en: s.name_en || '', note: '' }
               : { zh: `車站 ${sid}`, en: `STOP ${sid}`, note: '' };
    }).filter(s => s.zh);

    const out = {
      id, co: meta.co, route: meta.route, boundLabel: boundLabel(meta),
      origTc: meta.origTc, origEn: meta.origEn,
      destTc: meta.destTc, destEn: meta.destEn,
      stops: list
    };
    routeStopCache.set(id, out);
    return out;
  }

  /* ---------------- 收藏 ---------------- */
  const FAV_KEY = 'hkbus-ann:fav';
  function favorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
  }
  function toggleFav(id, label) {
    const f = favorites();
    const i = f.findIndex(x => x.id === id);
    if (i >= 0) f.splice(i, 1); else f.unshift({ id, label });
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f.slice(0, 30))); } catch (e) {}
    return favorites();
  }
  function isFav(id) { return favorites().some(x => x.id === id); }

  /* ---------------- 設定持久化 ---------------- */
  const CFG_KEY = 'hkbus-ann:cfg';
  function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
  function saveCfg(o) { try { localStorage.setItem(CFG_KEY, JSON.stringify(o)); } catch (e) {} }

  return { init, search, byId, getRoute, otherBound, boundLabel, state, favorites, toggleFav, isFav, loadCfg, saveCfg, get state_() { return state; } };
})();
