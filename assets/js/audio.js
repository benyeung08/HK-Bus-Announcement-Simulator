/* ============================================================
   真實報站音檔引擎
   ------------------------------------------------------------
   音檔放進 audio/ 目錄，並由 audio/manifest.json 建立索引。
   命名依九巴／龍運 BM-2013-KMB 報站機 SD 卡規則：

     車站音檔      <車站編號去橫線>_YUE.mp3  （_EN / _CN 同理）
                   例：KA07-E-1000-0 → KA07E10000_YUE.mp3
     特別廣播      ATTEN10010_YUE.mp3        （請緊握扶手）
     歡迎辭        <起點站編號><路線號>W_YUE.mp3
                   例：GT70T10502A33W_YUE.mp3
     到達終點提示  <終點站編號><路線號>G_YUE.mp3
                   例：GT70T08502A33G_YUE.mp3

   找不到音檔的段落自動退回瀏覽器語音合成，不會無聲。
   ============================================================ */

const AnnAudio = (() => {
  const MANIFEST = 'audio/manifest.json';

  const LANG_OF = { cantonese: 'YUE', english: 'EN', putonghua: 'CN' };

  const state = {
    loaded: false,   // 是否已嘗試載入
    ok: false,       // 是否有可用音檔
    msg: '',
    files: 0,        // 音檔總數
    stops: 0,        // 可對應的車站數
    phraseCount: 0,  // ATTEN 類提示數
    phrases: {},     // manifest 宣告的語意片語（nextStop / interchange 等）
    prefix: 'name'
  };

  const idx = new Map();     // key(不含語言字尾) -> { YUE:url, EN:url, CN:url }
  const pool = new Map();    // url -> Audio（重用，兼作預載）

  /* ---------------- 索引 ---------------- */
  function flatCode(code) {
    return String(code || '').replace(/-/g, '').toUpperCase();
  }

  /** 由檔名解析出 key 與語言：KA07E10000_YUE.mp3 → {key:'KA07E10000', lang:'YUE'} */
  function parseName(name) {
    const m = /^(.+?)_(YUE|EN|CN)\.(mp3|wav|m4a|ogg|aac)$/i.exec(name.trim());
    if (!m) return null;
    return { key: m[1].toUpperCase(), lang: m[2].toUpperCase() };
  }

  function build(files, dir) {
    idx.clear();
    const base = (dir || 'audio/').replace(/\/*$/, '/');
    for (const f of files || []) {
      const p = parseName(f);
      if (!p) continue;
      const url = base + f.trim();
      let e = idx.get(p.key);
      if (!e) { e = {}; idx.set(p.key, e); }
      e[p.lang] = url;
    }
    state.files = idx.size;
    state.stops = Array.from(idx.keys()).filter(k => !/^ATTEN|^NOTE/.test(k)).length;
    state.phraseCount = idx.size - state.stops;
    state.ok = idx.size > 0;
  }

  async function load(force) {
    if (state.loaded && !force) return state;
    state.loaded = true;
    try {
      const r = await fetch(MANIFEST, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      build(j.files, j.dir);
      state.prefix = j.prefix === 'full' ? 'full' : 'name';  // name = 音檔只含站名；full = 已含整句
      state.phrases = j.phrases || {};
      state.msg = state.ok
        ? `已載入 ${state.files} 組音檔（${state.stops} 個車站 · ${state.phraseCount} 段提示）`
        : 'manifest.json 內沒有可辨識的音檔';
    } catch (e) {
      state.ok = false;
      state.msg = '找不到 audio/manifest.json，全部使用語音合成';
    }
    return state;
  }

  /* ---------------- 查詢 ---------------- */
  function urlFor(key, lang) {
    if (!key || !state.ok) return null;
    const e = idx.get(String(key).toUpperCase());
    if (!e) return null;
    return e[LANG_OF[lang] || 'YUE'] || null;
  }

  /** 車站音檔 key */
  const stopKey = code => flatCode(code);
  /** 歡迎辭：起點站編號 + 路線號 + W */
  const welcomeKey = (origCode, routeNo) => `${flatCode(origCode)}${String(routeNo).toUpperCase()}W`;
  /** 到達終點：終點站編號 + 路線號 + G */
  const terminusKey = (destCode, routeNo) => `${flatCode(destCode)}${String(routeNo).toUpperCase()}G`;
  const HANDRAIL_KEY = 'ATTEN10010';

  function has(key) { return !!(key && state.ok && idx.has(String(key).toUpperCase())); }

  /* ---------------- 播放 ---------------- */
  function el(url) {
    let a = pool.get(url);
    if (!a) { a = new Audio(url); a.preload = 'auto'; pool.set(url, a); }
    return a;
  }

  /**
   * 播放一段音檔，回傳 Promise（播完 resolve，失敗 resolve(false)）
   */
  function play(url, opt = {}) {
    return new Promise(resolve => {
      if (!url) return resolve(false);
      const a = el(url);
      let done = false;
      const finish = ok => { if (done) return; done = true; clearTimeout(guard); a.onended = a.onerror = null; resolve(ok); };

      try {
        a.pause();
        a.currentTime = 0;
        a.volume = Math.max(0, Math.min(1, opt.volume ?? 1));
        a.playbackRate = Math.max(0.5, Math.min(2, opt.rate ?? 1));
      } catch (e) { return finish(false); }

      const dur = (isFinite(a.duration) && a.duration > 0 ? a.duration : 6) * 1000;
      const guard = setTimeout(() => finish(true), dur / (opt.rate ?? 1) + 6000);

      a.onended = () => finish(true);
      a.onerror = () => finish(false);
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => finish(false));
    });
  }

  /** 預載接下來幾站，減少播放延遲 */
  function preload(keys) {
    if (!state.ok) return;
    (keys || []).forEach(k => {
      ['cantonese', 'english', 'putonghua'].forEach(l => {
        const u = urlFor(k, l);
        if (u) el(u);
      });
    });
  }

  function cancel() {
    pool.forEach(a => { try { a.pause(); } catch (e) {} });
  }

  /** 取得某站三語齊全程度，供介面顯示覆蓋率 */
  function stopCoverage(list) {
    if (!state.ok || !list || !list.length) return { hit: 0, total: 0, pct: 0 };
    let hit = 0;
    for (const s of list) if (has(stopKey(s.code))) hit++;
    return { hit, total: list.length, pct: Math.round(hit / list.length * 100) };
  }

  return {
    load, state, urlFor, play, preload, cancel, has, stopCoverage,
    stopKey, welcomeKey, terminusKey, HANDRAIL_KEY, flatCode,
    get prefixMode() { return state.prefix || 'name'; }
  };
})();
