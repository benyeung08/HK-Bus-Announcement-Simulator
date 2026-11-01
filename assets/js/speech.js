/* ============================================================
   語音合成 + 車廂音效
   - 廣東話：zh-HK　普通話：zh-CN　英語：en-GB
   - 找不到粵語語音時自動降級，並在介面提示
   ============================================================ */

const Speech = (() => {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  let voices = [];
  let voiceWarned = false;

  const LANGS = {
    cantonese: ['zh-HK', 'zh-TW', 'zh-MO', 'yue-Hant-HK', 'zh'],
    putonghua: ['zh-CN', 'zh-Hans', 'zh'],
    english: ['en-GB', 'en-US', 'en']
  };

  function loadVoices() {
    if (!supported) return;
    voices = window.speechSynthesis.getVoices() || [];
  }

  if (supported) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice(langKey) {
    const prefers = LANGS[langKey] || ['zh'];
    for (const code of prefers) {
      const hit = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-') === code.toLowerCase());
      if (hit) return hit;
    }
    for (const code of prefers) {
      const short = code.split('-')[0].toLowerCase();
      const hit = voices.find(v => (v.lang || '').toLowerCase().split('-')[0] === short);
      if (hit) return hit;
    }
    return null;
  }

  /* 沒有語音時用字數估算停留時間，畫面節奏才不會亂 */
  function estimateMs(text) {
    const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f]/g) || []).length;
    const words = (text.replace(/[\u3400-\u9fff\uf900-\ufaff\u3000-\u303f]/g, ' ')
      .match(/[A-Za-z0-9']+/g) || []).length;
    return Math.min(20000, Math.max(1100, cjk * 230 + words * 330));
  }

  function status() {
    if (!supported) return { ok: false, msg: '此瀏覽器不支援語音合成，將以字幕模式播放' };
    loadVoices();
    const hasCantonese = !!pickVoice('cantonese');
    const hasEnglish = !!pickVoice('english');
    if (!voices.length) return { ok: true, msg: '語音清單載入中，首次播放後會自動生效' };
    if (!hasCantonese) return { ok: true, msg: '找不到粵語語音，廣東話將以相近中文語音讀出' };
    if (!hasEnglish) return { ok: true, msg: '找不到英語語音，英文將以預設語音讀出' };
    return { ok: true, msg: '' };
  }

  let current = null;

  /**
   * 朗讀一段文字，回傳 Promise（播完或被中斷才 resolve）
   * @param {string} text 文字
   * @param {string} langKey cantonese | putonghua | english
   * @param {object} opt { rate, volume, muted }
   */
  function speak(text, langKey, opt = {}) {
    const rate = opt.rate ?? 1;
    const volume = opt.volume ?? 1;
    const muted = !!opt.muted;

    if (!supported || muted) {
      return new Promise(res => setTimeout(res, estimateMs(text) * (muted ? 0.7 : 1) / rate));
    }

    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(langKey);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || (LANGS[langKey] || ['zh'])[0];
      u.rate = langKey === 'cantonese' ? rate * 0.95 : rate;
      u.pitch = 1;
      u.volume = volume;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      // Safari / 部分 Android 不會觸發 onend，加一道保險
      const guard = setTimeout(finish, estimateMs(text) / rate + 9000);

      u.onend = finish;
      u.onerror = finish;
      current = u;
      window.speechSynthesis.speak(u);
    });
  }

  function cancel() {
    if (supported) window.speechSynthesis.cancel();
    current = null;
  }

  /* ---------- Web Audio 音效：下車鐘「叮—咚」 ---------- */
  let actx = null;
  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, start, dur, gainPeak = 0.22) {
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gainPeak, c.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    osc.connect(g).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + dur + 0.05);
  }

  /** 下車鐘：一高一低的兩聲「叮咚」 */
  function bell() {
    const c = ctx();
    if (!c) return;
    tone(988, 0, 0.55);
    tone(740, 0.42, 0.75);
  }

  /** 到站開門的輕提示聲 */
  function doorChime() {
    const c = ctx();
    if (!c) return;
    tone(660, 0, 0.35, 0.14);
  }

  return { supported, speak, cancel, status, bell, doorChime, loadVoices };
})();
