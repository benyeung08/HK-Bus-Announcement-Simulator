#!/usr/bin/env node
/* ============================================================
   產生 audio/manifest.json
   用法：node tools/gen-manifest.js [音檔目錄] [輸出檔]
   會掃描目錄內所有 _YUE / _EN / _CN 音檔，寫入 files 清單，
   並保留既有 manifest 的 dir / prefix / phrases 設定。
   ============================================================ */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dir = process.argv[2] || 'audio';
const outArg = process.argv[3] || path.join(dir, 'manifest.json');

const absDir = path.isAbsolute(dir) ? dir : path.join(root, dir);
const outFile = path.isAbsolute(outArg) ? outArg : path.join(root, outArg);

const RE = /_(YUE|EN|CN)\.(mp3|wav|m4a|ogg|aac)$/i;

if (!fs.existsSync(absDir)) {
  console.error('找不到目錄：' + absDir);
  process.exit(1);
}

const files = fs.readdirSync(absDir)
  .filter(f => RE.test(f))
  .sort((a, b) => a.localeCompare(b, 'en'));

// 保留既有設定
let prev = {};
try { prev = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (e) {}

const manifest = {
  _說明: prev._說明 || '音檔索引（由 tools/gen-manifest.js 自動產生）',
  _命名規則: prev._命名規則 ||
    '車站：<車站編號去掉橫線>_YUE.mp3（_EN / _CN）；請緊握扶手：ATTEN10010_YUE.mp3；歡迎辭：<起點站編號><路線號>W_YUE.mp3；到達終點：<終點站編號><路線號>G_YUE.mp3',
  dir: prev.dir || dir.replace(/\\/g, '/').replace(/\/*$/, '') + '/',
  prefix: prev.prefix || 'name',
  phrases: prev.phrases || { nextStop: '', interchange: '' },
  files
};

fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const stops = new Set(files.map(f => f.replace(RE, '')));
const atten = Array.from(stops).filter(k => /^(ATTEN|NOTE)/i.test(k)).length;
console.log(`已寫入 ${path.relative(root, outFile)}`);
console.log(`  音檔 ${files.length} 個 → ${stops.size} 組（車站 ${stops.size - atten} · 提示 ${atten}）`);
console.log(`  語言分佈：YUE ${files.filter(f=>/_YUE\./i.test(f)).length} / EN ${files.filter(f=>/_EN\./i.test(f)).length} / CN ${files.filter(f=>/_CN\./i.test(f)).length}`);
