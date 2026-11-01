/* ============================================================
   香港巴士報站模擬器 — 主邏輯
   報站流程：開出總站（歡迎辭）→ 沿途「下一站」廣播 → 到站 → 終點站廣播
   廣播順序依實車：【廣東話】→【英文】→【普通話】
   ============================================================ */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const el = {
    routeSel: $('#routeSel'),
    signRoute: $('#signRoute'), signDestZh: $('#signDestZh'),
    signDestEn: $('#signDestEn'), signOp: $('#signOp'),
    screen: $('#screen'), lineZh: $('#lineZh'), lineEn: $('#lineEn'),
    screenTag: $('#screenTag'), screenTagEn: $('#screenTagEn'),
    progressText: $('#progressText'), runDots: $('#runDots'),
    txt: { cantonese: $('#txtCantonese'), english: $('#txtEnglish'), putonghua: $('#txtPutonghua') },
    stopList: $('#stopList'),
    rate: $('#rate'), rateVal: $('#rateVal'), vol: $('#vol'), volVal: $('#volVal'),
    hint: $('#hint'),
    btnStart: $('#btnStart'), btnNext: $('#btnNext'), btnTerminus: $('#btnTerminus'),
    btnAuto: $('#btnAuto'), btnBell: $('#btnBell'), btnStop: $('#btnStop')
  };

  const LANGS = ['cantonese', 'english', 'putonghua'];
  let route = window.ROUTES[0];
  let idx = -1;              // -1 = 未開出；0 = 在總站
  let token = 0;             // 每次中止遞增，用來終止舊的播放協程
  let auto = false;
  let dotTimer = null;

  /* ---------------- 介面初始化 ---------------- */
  function initRoutes() {
    el.routeSel.innerHTML = window.ROUTES
      .map(r => `<option value="${r.id}">${r.operatorZh} ${r.route} — 往 ${r.destZh}</option>`)
      .join('');
    el.routeSel.value = route.id;
  }

  function applyRoute() {
    route = window.ROUTES.find(r => r.id === el.routeSel.value) || window.ROUTES[0];
    document.documentElement.style.setProperty('--accent', route.accent);
    document.documentElement.style.setProperty('--accent-soft', hexA(route.accent, .14));
    el.signRoute.textContent = route.route;
    el.signDestZh.textContent = route.destZh;
    el.signDestEn.textContent = trimEn(route.destEn.toUpperCase(), 22);
    el.signOp.textContent = `${route.operatorZh} ${route.operator}`;
    idx = -1;
    renderStops();
    idleScreen();
    setProgress();
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function renderStops() {
    el.stopList.innerHTML = route.stops.map((s, i) => {
      const cls = [
        i === 0 ? 'terminus' : '',
        i === route.stops.length - 1 ? 'terminus' : ''
      ].join(' ');
      return `<li data-i="${i}" class="${cls}">
        <span class="idx">${i + 1}</span>
        <span class="nm">${s.zh}<em>${s.en}</em></span>
      </li>`;
    }).join('');
    $$('#stopList li').forEach(li => li.addEventListener('click', () => {
      const i = +li.dataset.i;
      hardStop();
      if (i === 0) { const t = ++token; welcome(t); return; }
      idx = i - 1;
      advance();
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

  /* ---------------- 顯示屏 ---------------- */
  function trimEn(t, n) { return t.length > n ? t.slice(0, n - 1) + '.' : t; }

  function splitZh(name) {   // 舊款屏最多 6 字、新款 8 字，超出就分頁捲動
    if (name.length <= 8) return [name];
    const mid = Math.ceil(name.length / 2);
    return [name.slice(0, mid), name.slice(mid)];
  }

  function splitEn(name) {   // 英文每列最多 16 字元，兩列
    if (name.length <= 18) return [name];
    const words = name.split(' ');
    const a = [], b = [];
    words.forEach(w => ((a.join(' ') + ' ' + w).length <= 18 ? a : b).push(w));
    return [a.join(' '), b.join(' ') || words[words.length - 1]];
  }

  function setScreen(zh, en) {
    const zhPages = splitZh(zh);
    const enLines = splitEn(en.toUpperCase());
    el.lineZh.innerHTML = zhPages.map(p => `<b>${p}</b>`).join('');
    el.lineEn.innerHTML = enLines.map(p => `<b>${p}</b>`).join('');
    el.lineZh.classList.toggle('rolling', zhPages.length > 1);
    el.screen.classList.remove('idle');
  }

  function setTag(zh, en) { el.screenTag.textContent = zh; el.screenTagEn.textContent = en; }

  function idleScreen() {
    el.screen.classList.add('idle');
    setScreen('請按開出', 'PRESS DEPART');
    setTag('待機', 'STANDBY');
  }

  function setProgress(extra) {
    const total = route.stops.length;
    if (idx < 0) { el.progressText.textContent = '尚未開出 · 全程 ' + total + ' 站'; return; }
    el.progressText.textContent = `第 ${idx + 1}/${total} 站 · ${extra || route.stops[idx].zh}`;
  }

  function startDots() {
    let k = 0;
    clearInterval(dotTimer);
    dotTimer = setInterval(() => {
      k = (k + 1) % 4;
      el.runDots.textContent = '●'.repeat(k) + '○'.repeat(3 - k);
    }, 420);
  }
  function stopDots() { clearInterval(dotTimer); el.runDots.textContent = ''; }

  /* ---------------- 字幕 ---------------- */
  function setScripts(map) {
    LANGS.forEach(l => { if (map[l] != null) el.txt[l].textContent = map[l]; });
  }
  function highlight(lang) {
    $$('.line-item').forEach(it => it.classList.toggle('active', it.dataset.lang === lang));
  }

  /* ---------------- 廣播稿 ---------------- */
  const scripts = {
    KMB: {
      welcome: r => ({
        cantonese: `各位乘客，歡迎乘搭九龍巴士公司${r.route}線，本班車將由${r.originZh}開往${r.destZh}，中途將有廣播提示各位乘客落車，祝各位旅途愉快。`,
        english: `Dear passengers, on behalf of Kowloon Motor Bus Company, I would like to welcome you on board our route number ${r.route} to ${r.destEn}. Further announcements will be made as we approach various mid-way bus stops. It is our pleasure to have you on board, and we wish you a pleasant journey.`,
        putonghua: `各位乘客，欢迎乘坐九龙巴士公司${r.route}线，本班车将由${r.originZh}开往${r.destZh}，中途将有广播提示各位乘客下车，祝各位旅途愉快。`
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
        cantonese: '乘客可以喺呢個站，用八達通卡轉乘其他九巴路線。',
        english: 'Passengers may use their Octopus cards to interchange with other KMB routes at this stop.',
        putonghua: '乘客可以在这个站，使用八达通卡转乘其他九巴路线。'
      },
      terminus: r => ({
        cantonese: `各位乘客，本班車已經到達${r.destZh}，請各位乘客落車，多謝乘搭${r.route}線。`,
        english: `We have arrived at ${r.destEn}. Please alight here. Thank you for travelling with Kowloon Motor Bus.`,
        putonghua: `各位乘客，本班车已经到达${r.destZh}，请各位乘客下车，多谢乘坐${r.route}线。`
      })
    },
    CTB: {
      welcome: r => ({
        cantonese: `歡迎乘搭城巴${r.route}號線，前往${r.destZh}，祝旅途愉快。`,
        english: `Welcome aboard Citybus route ${r.route} towards ${r.destEn}. Thank you and enjoy the journey.`,
        putonghua: `欢迎乘坐城巴第${r.route}路，前往${r.destZh}，祝您旅途愉快。`
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
      terminus: r => ({
        cantonese: '我哋已經到達終點站，落車時，請緊記攜帶您嘅隨身物品，多謝選搭城巴，拜拜！',
        english: 'We have arrived at the terminus. Please make sure all your personal belongings are with you when alighting. Thank you for travelling with Citybus, see you!',
        putonghua: '我们已经到达终点站，下车时，请紧记携带您的随身物品，谢谢选搭城巴，再见！'
      })
    }
  };

  /* ---------------- 播放核心 ---------------- */
  const opt = () => ({ rate: +el.rate.value, volume: +el.vol.value });
  const enabled = l => $(`#lang${l[0].toUpperCase()}${l.slice(1)}`).checked;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const alive = t => t === token;

  async function say(text, lang, t) {
    if (!alive(t)) return;
    highlight(lang);
    await Speech.speak(text, lang, opt());
  }

  /** 三語廣播一組稿：粵 → 英 → 國，逐段切換屏幕與字幕 */
  async function announce(map, t, screen) {
    if (!alive(t)) return;
    setScripts(map);
    for (const lang of LANGS) {
      if (!alive(t)) return;
      if (!enabled(lang)) { if (screen) screen(lang); continue; }
      if (screen) screen(lang);
      await say(map[lang], lang, t);
      if (!alive(t)) return;
      await sleep(180);
    }
    highlight(null);
  }

  async function welcome(t) {
    const s = scripts[route.operator];
    idx = 0;
    markStops(); setProgress('於總站開出');
    setTag('歡迎乘搭', 'WELCOME ONBOARD');
    startDots();
    await announce(s.welcome(route), t, lang => {
      if (route.operator === 'KMB') setScreen('歡迎乘坐九龍巴士', lang === 'english' ? 'WELCOME ONBOARD' : '歡迎乘坐九龍巴士');
      else setScreen('歡迎乘坐城巴', lang === 'english' ? 'WELCOME ONBOARD' : 'WELCOME ONBOARD');
    });
    stopDots();
    // 開出後畫面轉為「下一站」，語音留待按下／自動行車時才播出
    if (alive(t) && route.stops.length > 1) {
      await sleep(300);
      setTag('下一站', 'NEXT STOP');
      setScreen(route.stops[1].zh, route.stops[1].en);
      setProgress('下一站：' + route.stops[1].zh);
    }
  }

  async function nextStop(i, t) {
    const s = scripts[route.operator];
    const stop = route.stops[i];
    setTag('下一站', 'NEXT STOP');
    await announce(s.next(route, stop), t, lang => setScreen(stop.zh, stop.en));

    if (stop.note && alive(t) && LANGS.some(enabled)) {
      setTag('轉乘提示', 'INTERCHANGE');
      await announce(s.interchange, t, () => setScreen('八達通轉乘', 'OCTOPUS INTERCHANGE'));
    }
    if ($('#handrail').checked && alive(t)) {
      setTag('請緊握扶手', 'PLEASE HOLD THE HANDRAILS');
      await announce(s.handrail, t, () => setScreen('請緊握扶手', 'PLEASE HOLD THE HANDRAILS'));
    }
    setTag('下一站', 'NEXT STOP');
    setScreen(stop.zh, stop.en);
  }

  async function arriveStop(i, t) {
    if (!alive(t)) return;
    if ($('#bellChk').checked) Speech.bell();
    idx = i;
    markStops(); setProgress('已到站：' + route.stops[i].zh);
    setTag('此站', 'THIS STOP');
    setScreen(route.stops[i].zh, route.stops[i].en);
    setTimeout(() => Speech.doorChime(), 900);
    await sleep(auto ? 4200 / +el.rate.value : 2600);
  }

  async function terminus(t) {
    idx = route.stops.length - 1;
    markStops(); setProgress('終點站');
    const s = scripts[route.operator];
    setTag('終點站', 'TERMINUS');
    stopDots();
    await announce(s.terminus(route), t, lang =>
      setScreen(lang === 'cantonese' || lang === 'putonghua' ? '巴士總站' : 'BUS TERMINUS',
        lang === 'english' ? 'THANK YOU FOR TRAVELLING' : '多謝乘搭'));
    setScreen('多謝乘搭', 'THANK YOU FOR TRAVELLING');
    setAuto(false);
  }

  /** 前進一站：播下一站 → 到站 */
  async function advance() {
    const t = ++token;
    if (idx + 1 >= route.stops.length) { await terminus(t); return; }
    startDots();
    await nextStop(idx + 1, t);
    if (!alive(t)) { stopDots(); return; }
    await arriveStop(idx + 1, t);
    stopDots();
    if (!alive(t)) return;
    if (auto && idx < route.stops.length - 1) {
      await sleep(1200 / +el.rate.value);
      if (alive(t)) advance();
    }
  }

  function hardStop() {
    token++;
    Speech.cancel();
    stopDots();
    highlight(null);
    setAuto(false);
  }

  function setAuto(v) {
    auto = v;
    el.btnAuto.classList.toggle('on', v);
    el.btnAuto.textContent = v ? '⏸ 停止行車' : '🔁 自動行車';
  }

  /* ---------------- 事件 ---------------- */
  el.routeSel.addEventListener('change', () => { hardStop(); applyRoute(); });
  el.rate.addEventListener('input', () => el.rateVal.textContent = (+el.rate.value).toFixed(1) + '×');
  el.vol.addEventListener('input', () => el.volVal.textContent = Math.round(el.vol.value * 100) + '%');

  el.btnStart.addEventListener('click', () => {
    Speech.loadVoices(); hardStop();
    const t = ++token; welcome(t);
  });
  el.btnNext.addEventListener('click', () => {
    Speech.loadVoices();
    if (idx < 0) { const t = ++token; welcome(t); return; }
    advance();
  });
  el.btnTerminus.addEventListener('click', () => { Speech.loadVoices(); hardStop(); const t = ++token; terminus(t); });
  el.btnAuto.addEventListener('click', () => {
    Speech.loadVoices();
    if (auto) { hardStop(); return; }
    hardStop(); setAuto(true);
    if (idx < 0) { const t = ++token; welcome(t).then(() => { if (alive(token)) advance(); }); }
    else advance();
  });
  el.btnBell.addEventListener('click', () => { Speech.bell(); });
  el.btnStop.addEventListener('click', () => {
    hardStop();
    if (idx < 0) idleScreen(); else { setTag('已停止', 'STOPPED'); setScreen(route.stops[idx].zh, route.stops[idx].en); }
    setProgress('已停止');
  });

  /* ---------------- 啟動 ---------------- */
  initRoutes();
  applyRoute();
  const st = Speech.status();
  if (st.msg) el.hint.textContent = '提示：' + st.msg;
  setTimeout(() => { const s2 = Speech.status(); if (s2.msg) el.hint.textContent = '提示：' + s2.msg; }, 1200);
})();
