/* ============================================================
   香港巴士報站模擬器 — 主程式
   流程：開出總站（歡迎辭）→「下一站」廣播 → 到站 → … → 終點站
   廣播順序依實車：【廣東話】→【English】→【普通話】
   ============================================================ */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const el = {
    status: $('#status'), hint: $('#hint'),
    q: $('#q'), co: $('#co'), results: $('#results'), favs: $('#favs'),
    stage: $('#stage'),
    signRoute: $('#signRoute'), signDestZh: $('#signDestZh'),
    signDestEn: $('#signDestEn'), signOp: $('#signOp'),
    screen: $('#screen'), lineZh: $('#lineZh'), lineEn: $('#lineEn'),
    screenTag: $('#screenTag'), screenTagEn: $('#screenTagEn'), screenBound: $('#screenBound'),
    stopLamp: $('#stopLamp'),
    dpip: $('#dpip'), legacy: $('#legacy'), driverRow: $('#driverRow'),
    dmRoute: $('#dmRoute'), dmDestZh: $('#dmDestZh'), dmDestEn: $('#dmDestEn'), dmCo: $('#dmCo'),
    dmTrack: $('#dmTrack'), dmMap: $('#dmMap'), dmBig: $('.dm-big'),
    dmTagZh: $('#dmTagZh'), dmTagEn: $('#dmTagEn'),
    dmBigZh: $('#dmBigZh'), dmBigEn: $('#dmBigEn'),
    dmDriverZh: $('#dmDriverZh'), dmDriverEn: $('#dmDriverEn'), dmStaff: $('#dmStaff'),
    dpipSec: $('#dpipSec'), stopLampDpip: $('#stopLampDpip'),
    driverName: $('#driverName'), staffNo: $('#staffNo'),
    audioInfo: $('#audioInfo'), btnAudio: $('#btnAudio'),
    progressText: $('#progressText'), runDots: $('#runDots'),
    pbarFill: $('#pbarFill'), pbarDot: $('#pbarDot'), next3: $('#next3'),
    txt: { cantonese: $('#txtCantonese'), english: $('#txtEnglish'), putonghua: $('#txtPutonghua') },
    stopList: $('#stopList'),
    crName: $('#crName'), crBound: $('#crBound'),
    rate: $('#rate'), rateVal: $('#rateVal'), vol: $('#vol'), volVal: $('#volVal'),
    gap: $('#gap'), gapVal: $('#gapVal'),
    btnStart: $('#btnStart'), btnNext: $('#btnNext'), btnPrev: $('#btnPrev'),
    btnTerminus: $('#btnTerminus'), btnAuto: $('#btnAuto'), btnBell: $('#btnBell'),
    btnStop: $('#btnStop'), btnReset: $('#btnReset'), btnFlip: $('#btnFlip'),
    btnFav: $('#btnFav'), btnFs: $('#btnFs')
  };

  const LANGS = ['cantonese', 'english', 'putonghua'];
  const ACCENT = { KMB: '#ff6a13', LWB: '#26a65b', CTB: '#f5c518' };

  let meta = null;      // 目前路線的中繼資料
  let trip = null;      // 完整行程（含 stops）
  let idx = -1;
  let token = 0;
  let auto = false;
  let dotTimer = null;
  let wakeLock = null;
  let loading = false;

  const opt = () => ({ rate: +el.rate.value, volume: +el.vol.value });
  const enabled = l => $(`#lang${l[0].toUpperCase()}${l.slice(1)}`).checked;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const alive = t => t === token && !loading;

  /* ==========================================================
     營辦商識別（九巴 API 同時含龍運路線）
     ========================================================== */
  function resolveOperator(co, routeNo) {
    if (co === 'CTB') return { key: 'CTB', zh: '城巴', zhLong: '城巴', en: 'Citybus' };
    if (/^[AERS]/.test(routeNo) && routeNo.length > 1) {
      return { key: 'KMB', zh: '龍運', zhLong: '龍運巴士', en: 'Long Win Bus' };
    }
    return { key: 'KMB', zh: '九巴', zhLong: '九龍巴士公司', en: 'Kowloon Motor Bus' };
  }

  /* ==========================================================
     廣播稿
     ========================================================== */
  const scripts = {
    KMB: {
      welcome: r => ({
        cantonese: `各位乘客，歡迎乘搭${r.operatorLong}${r.routeNo}線，本班車將由${r.originZh}開往${r.destZh}，中途將有廣播提示各位乘客落車，祝各位旅途愉快。`,
        english: `Dear passengers, on behalf of ${r.operatorEn}, I would like to welcome you on board our route number ${r.routeNo} to ${r.destEn}. Further announcements will be made as we approach various mid-way bus stops. It is our pleasure to have you on board, and we wish you a pleasant journey.`,
        putonghua: `各位乘客，欢迎乘坐${r.operatorLong}${r.routeNo}线，本班车将由${r.originZh}开往${r.destZh}，中途将有广播提示各位乘客下车，祝各位旅途愉快。`
      }),
      next: (r, s) => ({
        cantonese: `下一站係：${s.zh}。`,
        english: `The next stop is: ${s.en}.`,
        putonghua: `下一站是：${s.zh}。`
      }),
      handrail: {
        cantonese: '請緊握扶手。', english: 'Please hold the handrail.', putonghua: '請緊握扶手。'
      },
      interchange: {
        cantonese: '乘客可以喺呢個站，用八達通卡轉乘其他巴士路線。',
        english: 'Passengers may use their Octopus cards to interchange with other bus routes at this stop.',
        putonghua: '乘客可以在这个站，使用八达通卡转乘其他巴士路线。'
      },
      terminus: r => ({
        cantonese: `各位乘客，本班車已經到達${r.destZh}，請各位乘客落車，多謝乘搭${r.routeNo}線。`,
        english: `We have arrived at ${r.destEn}. Please alight here. Thank you for travelling with ${r.operatorEn}.`,
        putonghua: `各位乘客，本班车已经到达${r.destZh}，请各位乘客下车，多谢乘坐${r.routeNo}线。`
      })
    },
    CTB: {
      welcome: r => ({
        cantonese: `歡迎乘搭城巴${r.routeNo}號線，前往${r.destZh}，祝旅途愉快。`,
        english: `Welcome aboard Citybus route ${r.routeNo} towards ${r.destEn}. Thank you and enjoy the journey.`,
        putonghua: `欢迎乘坐城巴第${r.routeNo}路，前往${r.destZh}，祝您旅途愉快。`
      }),
      next: (r, s) => ({
        cantonese: `下一站：${s.zh}${s.note ? '，' + s.note : ''}。`,
        english: `Next stop: ${s.en}.`,
        putonghua: `下一站：${s.zh}${s.note ? '，' + s.note : ''}。`
      }),
      handrail: {
        cantonese: '請緊握扶手。', english: 'Please hold the handrail.', putonghua: '請緊握扶手。'
      },
      interchange: {
        cantonese: '乘客可以喺呢個站轉乘其他城巴路線。',
        english: 'Passengers may interchange with other Citybus routes at this stop.',
        putonghua: '乘客可以在这个站转乘其他城巴路线。'
      },
      terminus: () => ({
        cantonese: '我哋已經到達終點站，落車時，請緊記攜帶您嘅隨身物品，多謝選搭城巴，拜拜！',
        english: 'We have arrived at the terminus. Please make sure all your personal belongings are with you when alighting. Thank you for travelling with Citybus, see you!',
        putonghua: '我们已经到达终点站，下车时，请紧记携带您的随身物品，谢谢选搭城巴，再见！'
      })
    }
  };

  /* ==========================================================
     顯示
     ========================================================== */
  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-soft', hexA(hex, .14));
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const trimEn = (t, n) => (t.length > n ? t.slice(0, n - 1) + '.' : t);

  function splitZh(name, isNew) {
    const max = isNew ? 8 : 6;
    if (name.length <= max) return [name];
    const mid = Math.ceil(name.length / 2);
    return [name.slice(0, mid), name.slice(mid)];
  }
  function splitEn(name) {
    if (name.length <= 18) return [name];
    const w = name.split(' '), a = [], b = [];
    w.forEach(x => ((a.join(' ') + ' ' + x).length <= 18 ? a : b).push(x));
    return [a.join(' '), b.join(' ') || w[w.length - 1]];
  }

  /* 九巴／龍運用 DPIP 雙屏，城巴用走馬燈單屏 */
  const isDPIP = () => !!trip && trip.scriptKey === 'KMB';

  function showMode() {
    const d = isDPIP();
    el.dpip.hidden = !d;
    el.legacy.hidden = d;
    el.driverRow.hidden = !d;
    el.dpip.classList.toggle('lwb', !!trip && trip.isLWB);
  }

  function setBig(zh, en) {
    el.dmBigZh.textContent = zh;
    el.dmBigEn.textContent = en || '';
    el.dmBigEn.style.display = en ? '' : 'none';
    el.dmBig.classList.remove('idle');
    el.dmBig.classList.toggle('welcome', /WELCOME ABOARD/i.test(zh));
  }

  function setScreen(zh, en) {
    if (isDPIP()) {
      // 城巴稿的系統提示在九巴屏上以中英對照呈現
      setBig(zh, en);
      return;
    }
    const isNew = $('#styleNew').checked;
    el.screen.classList.toggle('old', !isNew);
    const zhP = splitZh(zh, isNew);
    const enP = splitEn((en || '').toUpperCase());
    el.lineZh.innerHTML = `<span>${zhP.map(p => `<b>${p}</b>`).join('')}</span>`;
    el.lineEn.innerHTML = `<span>${enP.map(p => `<b>${p}</b>`).join('')}</span>`;
    el.screen.classList.toggle('rolling', zhP.length > 1);
    el.screen.classList.remove('idle');
  }
  function setTag(zh, en) {
    if (isDPIP()) { el.dmTagZh.textContent = zh; el.dmTagEn.textContent = en; return; }
    el.screenTag.textContent = zh; el.screenTagEn.textContent = en;
  }

  /** 九巴屏的系統提示（請緊握扶手／轉乘）用中英並列 */
  function dualScreen(zh, en) { setBig(zh, isDPIP() ? en : zh); }

  function idleScreen(msgZh, msgEn) {
    if (isDPIP()) {
      el.dmBig.classList.add('idle');
      setBig(msgZh || '請先選擇路線', '');
      setTag('待機', 'STANDBY');
      return;
    }
    el.screen.classList.add('idle');
    setScreen(msgZh || '請先選擇路線', msgEn || 'SELECT A ROUTE');
    setTag('待機', 'STANDBY');
  }

  function lamp(on) {
    const show = $('#showLamp').checked;
    [el.stopLamp, el.stopLampDpip].forEach(n => {
      if (!n) return;
      n.classList.toggle('off', !show);
      n.classList.toggle('on', !!on);
    });
  }

  /* 紅色路線圖 */
  function renderMap() {
    if (!trip) { el.dmTrack.innerHTML = ''; return; }
    const n = trip.stops.length;
    el.dmTrack.innerHTML = trip.stops.map((s, i) => {
      const st = idx >= 0 ? (i < idx ? 'passed' : i === idx ? 'current' : '') : '';
      const term = (i === 0 || i === n - 1) ? 'term' : '';
      return `<div class="dm-node ${st} ${term}"><i></i><em>${s.en || ''}</em></div>`;
    }).join('');
    const cur = el.dmTrack.querySelector('.current') || el.dmTrack.firstElementChild;
    if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  /* 副屏：當前站 + 下兩站 */
  function renderSec() {
    if (!trip) { el.dpipSec.innerHTML = ''; return; }
    const base = Math.max(0, idx);
    const out = [];
    for (let k = 0; k < 3; k++) {
      const s = trip.stops[base + k];
      if (!s) break;
      out.push(`<div class="ds-row ${k === 0 ? 'cur' : ''}">
        <span class="ds-num">${base + k + 1}</span>
        <span class="ds-dot"></span>
        <span class="ds-name"><b>${s.zh}</b><em>${s.en || ''}</em></span>
      </div>`);
    }
    el.dpipSec.innerHTML = out.join('');
  }

  function setDriverInfo() {
    const name = (el.driverName.value || '陳大文').trim();
    const no = (el.staffNo.value || '1933').trim();
    el.dmDriverZh.textContent = `${name}車長正為您服務`;
    el.dmDriverEn.textContent = `Bus Captain ${name} is serving you`;
    el.dmStaff.textContent = `員工編號 Staff No.: ${no}`;
  }

  function setScripts(map) {
    LANGS.forEach(l => { if (map[l] != null) el.txt[l].textContent = map[l]; });
  }
  function highlight(lang) {
    $$('.line-item').forEach(it => it.classList.toggle('active', it.dataset.lang === lang));
  }

  function renderStops() {
    if (!trip) { el.stopList.innerHTML = ''; return; }
    const n = trip.stops.length;
    el.stopList.innerHTML = trip.stops.map((s, i) => `
      <li data-i="${i}" class="${i === 0 || i === n - 1 ? 'terminus' : ''}">
        <span class="idx">${i + 1}</span>
        <span class="nm">${s.zh}<em>${s.en}</em></span>
      </li>`).join('');
    $$('#stopList li').forEach(li => li.addEventListener('click', () => {
      const i = +li.dataset.i;
      hardStop();
      if (i === 0) { const t = ++token; welcome(t); return; }
      idx = i - 1; advance();
    }));
    markStops();
  }
  function markStops() {
    $$('#stopList li').forEach(li => {
      const i = +li.dataset.i;
      li.classList.toggle('current', i === idx);
      li.classList.toggle('passed', idx >= 0 && i < idx);
    });
    const cur = el.stopList.querySelector('li.current');
    if (cur) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function updateProgress(extra) {
    if (!trip) return;
    const n = trip.stops.length;
    if (idx < 0) {
      el.progressText.textContent = `尚未開出 · 全程 ${n} 站`;
      el.pbarFill.style.width = '0%'; el.pbarDot.style.left = '0%';
    } else {
      const pct = n > 1 ? (idx / (n - 1)) * 100 : 100;
      el.progressText.textContent = `第 ${idx + 1}/${n} 站 · ${extra || trip.stops[idx].zh}`;
      el.pbarFill.style.width = pct + '%'; el.pbarDot.style.left = pct + '%';
    }
    renderNext3();
  }
  function renderNext3() {
    if (isDPIP()) { renderSec(); renderMap(); return; }
    if (!trip) { el.next3.innerHTML = ''; return; }
    const out = [];
    const base = Math.max(0, idx);   // 未開出時視為停在第 1 站，接下來是第 2 站起
    for (let k = 1; k <= 3; k++) {
      const s = trip.stops[base + k];
      if (!s) break;
      out.push(`<div><b>${k === 1 ? '下一站 ' : ''}${s.zh}</b><span>${s.en}</span></div>`);
    }
    el.next3.innerHTML = out.join('');
  }

  function startDots() {
    let k = 0; clearInterval(dotTimer);
    dotTimer = setInterval(() => {
      k = (k + 1) % 4;
      el.runDots.textContent = '●'.repeat(k) + '○'.repeat(3 - k);
    }, 420);
  }
  function stopDots() { clearInterval(dotTimer); el.runDots.textContent = ''; }

  /* ==========================================================
     播放核心
     ========================================================== */
  /* ---------- 真實音檔：決定某段廣播要播哪些音檔 ---------- */
  function audioPlan(kind, stop) {
    if (!$('#useAudio').checked || !AnnAudio.state.ok || !trip) return null;
    const P = AnnAudio.prefixMode;
    const ph = AnnAudio.state.phrases || {};
    switch (kind) {
      case 'welcome':
        return () => [AnnAudio.welcomeKey(trip.stops[0].code, trip.routeNo)];
      case 'terminus':
        return () => [AnnAudio.terminusKey(trip.stops[trip.stops.length - 1].code, trip.routeNo)];
      case 'handrail':
        return () => [AnnAudio.HANDRAIL_KEY];
      case 'next': {
        const stopK = AnnAudio.stopKey(stop.code);
        if (P === 'full') return () => [stopK];
        // 音檔只含站名時，若有「下一站」片語且真的有檔，就先播片語
        return () => (ph.nextStop && AnnAudio.has(ph.nextStop) ? [ph.nextStop, stopK] : [stopK]);
      }
      case 'interchange':
        return ph.interchange ? () => [ph.interchange] : null;
      default:
        return null;
    }
  }

  async function say(text, lang, t, planFn) {
    if (!alive(t)) return;
    highlight(lang);
    const keys = planFn ? planFn(lang) : null;
    if (keys && keys.length) {
      const urls = keys.map(k => AnnAudio.urlFor(k, lang));
      // 該語言此段音檔齊全才用音檔，否則整段退回語音合成（避免真假聲混在一起）
      if (urls.every(Boolean)) {
        let ok = true;
        for (const u of urls) {
          const r = await AnnAudio.play(u, opt());
          if (!r) { ok = false; break; }
          if (!alive(t)) return;
        }
        if (ok && alive(t)) { await sleep(200); return; }
      }
    }
    await Speech.speak(text, lang, opt());
  }

  async function announce(map, t, screenFn, planFn) {
    if (!alive(t)) return;
    setScripts(map);
    for (const lang of LANGS) {
      if (!alive(t)) return;
      if (!enabled(lang)) { if (screenFn) screenFn(lang); continue; }
      if (screenFn) screenFn(lang);
      await say(map[lang], lang, t, planFn);
      if (!alive(t)) return;
      await sleep(180);
    }
    highlight(null);
  }

  async function welcome(t) {
    if (!trip) return;
    const s = scripts[trip.scriptKey];
    idx = 0; markStops(); updateProgress('於總站開出'); lamp(false);
    setTag('歡迎乘搭', 'WELCOME ONBOARD');
    startDots();
    const welcomeZh = trip.operatorZh === '城巴' ? '歡迎乘坐城巴' : '歡迎乘坐' + trip.operatorZh;
    await announce(s.welcome(trip), t, () => {
      if (isDPIP()) setBig('WELCOME ABOARD', '');
      else setScreen(welcomeZh, 'WELCOME ONBOARD');
    }, audioPlan('welcome'));
    stopDots();
    if (alive(t) && trip.stops.length > 1) {
      await sleep(300);
      setTag('下一站', 'NEXT STOP');
      setScreen(trip.stops[1].zh, trip.stops[1].en);
      updateProgress('下一站：' + trip.stops[1].zh);
    }
  }

  async function nextStop(i, t) {
    const s = scripts[trip.scriptKey];
    const stop = trip.stops[i];
    setTag('下一站', 'NEXT STOP');
    preloadAround(i);
    await announce(s.next(trip, stop), t, lang => setScreen(stop.zh, stop.en), audioPlan('next', stop));
    if (stop.note && alive(t) && LANGS.some(enabled)) {
      setTag('轉乘提示', 'INTERCHANGE');
      await announce(s.interchange, t, () => dualScreen('八達通轉乘', 'OCTOPUS INTERCHANGE'), audioPlan('interchange'));
    }
    if ($('#handrail').checked && alive(t)) {
      setTag('請緊握扶手', 'PLEASE HOLD THE HANDRAILS');
      await announce(s.handrail, t, () => dualScreen('請緊握扶手', 'PLEASE HOLD THE HANDRAILS'), audioPlan('handrail'));
    }
    setTag('下一站', 'NEXT STOP');
    setScreen(stop.zh, stop.en);
  }

  async function arriveStop(i, t) {
    if (!alive(t)) return;
    if ($('#bellChk').checked) Speech.bell();
    idx = i; markStops(); updateProgress('已到站：' + trip.stops[i].zh);
    setTag('此站', 'THIS STOP');
    setScreen(trip.stops[i].zh, trip.stops[i].en);
    lamp(true);
    setTimeout(() => Speech.doorChime(), 900);
    await sleep((auto ? +el.gap.value * 1000 : 1200) + 800);
  }

  async function terminus(t) {
    if (!trip) return;
    idx = trip.stops.length - 1;
    markStops(); updateProgress('終點站');
    const s = scripts[trip.scriptKey];
    setTag('終點站', 'TERMINUS'); stopDots(); lamp(true);
    await announce(s.terminus(trip), t, lang => {
      if (isDPIP()) setBig('多謝乘搭', 'THANK YOU FOR TRAVELLING');
      else setScreen(lang === 'cantonese' || lang === 'putonghua' ? '巴士總站' : 'BUS TERMINUS',
        lang === 'english' ? 'THANK YOU FOR TRAVELLING' : '多謝乘搭');
    }, audioPlan('terminus'));
    if (isDPIP()) setBig('多謝乘搭', 'THANK YOU FOR TRAVELLING');
    else setScreen('多謝乘搭', 'THANK YOU FOR TRAVELLING');
    setAuto(false);
  }

  async function advance() {
    if (!trip) return;
    const t = ++token;
    if (idx + 1 >= trip.stops.length) { await terminus(t); return; }
    startDots();
    await nextStop(idx + 1, t);
    if (!alive(t)) { stopDots(); return; }
    await arriveStop(idx + 1, t);
    stopDots();
    if (!alive(t)) return;
    lamp(false);
    if (auto && idx < trip.stops.length - 1) {
      await sleep(600);
      if (alive(t)) advance();
    }
  }

  /** 預載接下來幾站的音檔 */
  function preloadAround(i) {
    if (!trip) return;
    const keys = [];
    for (let k = 0; k <= 4; k++) {
      const s = trip.stops[i + k];
      if (s) keys.push(AnnAudio.stopKey(s.code));
    }
    AnnAudio.preload(keys);
  }

  function updateAudioInfo() {
    const st = AnnAudio.state;
    if (!st.ok) { el.audioInfo.textContent = st.msg || '尚未載入音檔'; return; }
    const on = $('#useAudio').checked;
    let txt = st.msg;
    if (trip) {
      const c = AnnAudio.stopCoverage(trip.stops);
      txt += ` · 本路線覆蓋 ${c.hit}/${c.total}（${c.pct}%）`;
    }
    el.audioInfo.textContent = (on ? '🎵 ' : '🔇 ') + txt;
  }

  function hardStop() {
    token++; Speech.cancel(); AnnAudio.cancel(); stopDots(); highlight(null); setAuto(false);
  }

  function setAuto(v) {
    auto = v;
    el.btnAuto.classList.toggle('on', v);
    el.btnAuto.textContent = v ? '⏸ 停止行車' : '🔁 自動行車';
  }

  /* ==========================================================
     路線載入
     ========================================================== */
  async function selectRoute(id) {
    hardStop();
    loading = true;
    el.hint.textContent = '正在載入此班次車站…';
    try {
      const r = await Data.getRoute(id, m => { el.hint.textContent = m; });
      const op = resolveOperator(r.co, r.route);
      meta = Data.byId(id) || null;
      trip = {
        id, routeNo: r.route, scriptKey: op.key, isLWB: op.zh === '龍運',
        operatorZh: op.zh, operatorLong: op.zhLong, operatorEn: op.en,
        originZh: r.origTc, originEn: r.origEn,
        destZh: r.destTc, destEn: r.destEn,
        bound: r.boundLabel,
        stops: r.stops
      };
      setAccent(ACCENT[op.zh === '龍運' ? 'LWB' : op.key]);
      el.signRoute.textContent = r.route;
      el.signDestZh.textContent = r.destTc;
      el.signDestEn.textContent = trimEn((r.destEn || r.destTc).toUpperCase(), 24);
      el.signOp.textContent = `${op.zh} ${op.key}`;
      el.screenBound.textContent = r.boundLabel || '';
      el.crName.textContent = `${op.zh} ${r.route} 往 ${r.destTc}`;
      el.crBound.textContent = r.boundLabel || '';
      el.btnFlip.disabled = !Data.otherBound(meta || { _fallback: true });
      // DPIP 主屏表頭
      el.dmRoute.textContent = r.route;
      el.dmDestZh.textContent = r.destTc;
      el.dmDestEn.textContent = (r.destEn || r.destTc || '').toUpperCase();
      el.dmCo.textContent = op.zh;
      setDriverInfo();
      idx = -1;
      showMode();
      renderStops(); updateProgress(); idleScreen('請按開出', 'PRESS DEPART');
      setScripts({ cantonese: '—', english: '—', putonghua: '—' });
      lamp(false);
      el.hint.textContent = `全程 ${r.stops.length} 個站`;
      updateAudioInfo();
      refreshFavBtn();
      markSelected(id);
      saveCfg();
    } catch (e) {
      el.hint.textContent = '載入失敗：' + (e && e.message ? e.message : '未知錯誤');
    } finally {
      loading = false;
    }
  }

  function markSelected(id) {
    $$('#results li').forEach(li => li.classList.toggle('sel', li.dataset.id === id));
  }
  function refreshFavBtn() {
    const on = trip && Data.isFav(trip.id);
    el.btnFav.classList.toggle('on', !!on);
    el.btnFav.textContent = on ? '★ 已收藏' : '☆ 收藏';
  }

  /* ==========================================================
     搜尋與收藏
     ========================================================== */
  let searchTimer = null;
  function renderResults() {
    if (!Data.state.routeIndexReady) {
      el.results.innerHTML = '<li class="empty">路線表載入中…</li>';
      return;
    }
    const list = Data.search(el.q.value, el.co.value);
    if (!list.length) {
      el.results.innerHTML = '<li class="empty">找不到相符路線</li>';
      return;
    }
    el.results.innerHTML = list.map(r => `
      <li data-id="${r.id}">
        <span class="rt">${r.route}</span>
        <span class="dst">往 ${r.destTc || '—'}</span>
        <span class="bd">${Data.boundLabel(r) || '內建'}</span>
      </li>`).join('');
    $$('#results li').forEach(li => li.addEventListener('click', () => selectRoute(li.dataset.id)));
    if (trip) markSelected(trip.id);
  }
  function renderFavs() {
    const f = Data.favorites();
    el.favs.innerHTML = f.map(x => `<span class="fav-chip" data-id="${x.id}">${x.label}</span>`).join('');
    $$('.fav-chip').forEach(c => c.addEventListener('click', () => selectRoute(c.dataset.id)));
  }

  /* ==========================================================
     設定
     ========================================================== */
  const CFG_KEYS = ['rate', 'vol', 'gap', 'langCantonese', 'langEnglish', 'langPutonghua',
    'handrail', 'bellChk', 'styleNew', 'keepAwake', 'showLamp', 'driverName', 'staffNo', 'useAudio'];
  function loadCfgIntoUI() {
    const c = Data.loadCfg();
    CFG_KEYS.forEach(k => {
      const node = $('#' + k);
      if (!node) return;
      if (node.type === 'checkbox') { if (k in c) node.checked = !!c[k]; }
      else if (c[k] != null) node.value = c[k];
    });
    syncLabels();
    if (c.routeId) el.q.dataset.restore = c.routeId;
  }
  function saveCfg() {
    const c = {};
    CFG_KEYS.forEach(k => {
      const node = $('#' + k);
      if (!node) return;
      c[k] = node.type === 'checkbox' ? node.checked : node.value;
    });
    if (trip) c.routeId = trip.id;
    Data.saveCfg(c);
  }
  function syncLabels() {
    el.rateVal.textContent = (+el.rate.value).toFixed(1) + '×';
    el.volVal.textContent = Math.round(el.vol.value * 100) + '%';
    el.gapVal.textContent = +el.gap.value + ' 秒';
    lamp(false);
  }

  /* ==========================================================
     全屏與螢幕常亮
     ========================================================== */
  function toggleFs() {
    const st = el.stage;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (st.requestFullscreen) st.requestFullscreen().catch(() => {});
  }
  async function setWakeLock(on) {
    try {
      if (on) {
        if ('wakeLock' in navigator && !wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
      } else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* 不支援就略過 */ }
  }

  /* ==========================================================
     事件
     ========================================================== */
  el.q.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderResults, 180);
  });
  el.co.addEventListener('change', renderResults);

  el.btnStart.addEventListener('click', () => { Speech.loadVoices(); if (!trip) return; hardStop(); const t = ++token; welcome(t); });
  el.btnNext.addEventListener('click', () => {
    Speech.loadVoices(); if (!trip) return;
    if (idx < 0) { const t = ++token; welcome(t); return; }
    advance();
  });
  el.btnPrev.addEventListener('click', () => {
    if (!trip) return; hardStop();
    idx = Math.max(0, idx - 1);
    markStops(); updateProgress('已到站：' + trip.stops[idx].zh);
    setTag('此站', 'THIS STOP'); setScreen(trip.stops[idx].zh, trip.stops[idx].en);
  });
  el.btnTerminus.addEventListener('click', () => { Speech.loadVoices(); if (!trip) return; hardStop(); const t = ++token; terminus(t); });
  el.btnAuto.addEventListener('click', () => {
    Speech.loadVoices(); if (!trip) return;
    if (auto) { hardStop(); return; }
    hardStop(); setAuto(true);
    if (idx < 0) { const t0 = ++token; welcome(t0).then(() => { if (alive(token) && auto) advance(); }); }
    else advance();
  });
  el.btnBell.addEventListener('click', () => Speech.bell());
  el.btnStop.addEventListener('click', () => {
    hardStop();
    if (trip && idx >= 0) {
      setTag('已停止', 'STOPPED'); setScreen(trip.stops[idx].zh, trip.stops[idx].en);
      updateProgress('已停止');
    } else idleScreen();
  });
  el.btnReset.addEventListener('click', () => {
    hardStop(); idx = -1; markStops(); updateProgress();
    idleScreen('請按開出', 'PRESS DEPART');
    setScripts({ cantonese: '—', english: '—', putonghua: '—' }); lamp(false);
  });
  el.btnFlip.addEventListener('click', () => {
    if (!meta) return;
    const alt = Data.otherBound(meta);
    if (alt) selectRoute(alt.id);
  });
  el.btnFav.addEventListener('click', () => {
    if (!trip) return;
    Data.toggleFav(trip.id, `${trip.operatorZh} ${trip.routeNo} 往 ${trip.destZh}`);
    renderFavs(); refreshFavBtn();
  });
  el.btnFs.addEventListener('click', toggleFs);

  ['rate', 'vol', 'gap'].forEach(k => $('#' + k).addEventListener('input', () => { syncLabels(); saveCfg(); }));
  ['driverName', 'staffNo'].forEach(k => $('#' + k).addEventListener('input', () => { setDriverInfo(); saveCfg(); }));
  $('#useAudio').addEventListener('change', () => { updateAudioInfo(); saveCfg(); });
  el.btnAudio.addEventListener('click', async () => {
    el.btnAudio.disabled = true;
    el.audioInfo.textContent = '正在載入 manifest…';
    await AnnAudio.load(true);
    updateAudioInfo();
    el.btnAudio.disabled = false;
  });
  CFG_KEYS.forEach(k => {
    const n = $('#' + k);
    if (!n) return;
    n.addEventListener('change', () => {
      if (k === 'keepAwake') setWakeLock(n.checked);
      if (k === 'showLamp') lamp(false);
      if (k === 'styleNew' && trip && idx >= 0) setScreen(trip.stops[idx].zh, trip.stops[idx].en);
      saveCfg();
    });
  });

  document.addEventListener('keydown', e => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'ArrowRight') { e.preventDefault(); el.btnNext.click(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); el.btnPrev.click(); }
    else if (k === ' ') { e.preventDefault(); el.btnAuto.click(); }
    else if (k === 'b' || k === 'B') Speech.bell();
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'r' || k === 'R') el.btnFlip.click();
    else if (k === 'Home') { e.preventDefault(); el.btnReset.click(); }
    else if (k === 'Escape') el.btnStop.click();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && $('#keepAwake').checked === false && auto) hardStop();
  });

  /* ==========================================================
     啟動
     ========================================================== */
  loadCfgIntoUI();
  renderFavs();

  Data.init(st => {
    el.status.textContent = st.msg;
    if (st.routeIndexReady) renderResults();
  }).then(st => {
    el.status.textContent = st.msg;
    renderResults();
    const restore = el.q.dataset.restore;
    if (restore && Data.byId(restore)) selectRoute(restore);
    else if (st.mode === 'fallback' && window.ROUTES && window.ROUTES.length) selectRoute('FB|' + window.ROUTES[0].id);
    if ($('#keepAwake').checked) setWakeLock(true);
    AnnAudio.load().then(() => updateAudioInfo());
  });

  setTimeout(() => {
    const s = Speech.status();
    if (s.msg) el.hint.textContent = '提示：' + s.msg;
  }, 1500);
})();
