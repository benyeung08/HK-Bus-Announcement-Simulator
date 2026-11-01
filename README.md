# 香港巴士報站模擬器 HK Bus Announcement Simulator

纯静态网页，模拟香港巴士车厢报站系统：粤语 → 英语 → 普通话三语广播、点阵式车厢显示屏、下车钟「叮咚」声，语音由浏览器即时合成，无需任何音频文件与后端。

## 功能

- **真实广播稿格式**：九巴／龙运（BM-2013-KMB）与城巴／新巴（Telargo）两套报站格式
- **三语顺序**：广东话 → English → 普通话，与实车一致，可单独开关任一语言
- **车厢显示屏**：黑底橙字点阵效果，站名超过 8 字自动分页上卷（模拟走马灯），英文超长自动折行
- **报站流程**：开出总站（欢迎辞）→「下一站」广播 →「请紧握扶手」→ 到站 → 终点站广播
- **下车钟**：Web Audio 合成「叮—咚」两声，可开关
- **自动行车**：一键跑完整条路线，可调语速、音量
- **沿途车站**：点击任一车站直接跳站
- 内置 4 个班次：九巴 1A（双向）、城巴 5B（双向）

## 本地预览

```bash
# 任选一种
python3 -m http.server 8000
npx serve .
```

然后打开 <http://localhost:8000>。直接双击 `index.html` 也可运行。

## 部署到 GitHub Pages（约 1 分钟）

1. 在 GitHub 新建仓库，例如 `hk-bus-announcement`，把本目录内容全部上传：

```bash
git init
git add .
git commit -m "Add HK bus announcement simulator"
git branch -M main
git remote add origin https://github.com/<你的账号>/hk-bus-announcement.git
git push -u origin main
```

2. 进入仓库 **Settings → Pages**，Source 选 `Deploy from a branch`，Branch 选 `main`、目录选 `/ (root)`，点 Save。

3. 约 30 秒后访问 `https://<你的账号>.github.io/hk-bus-announcement/` 即可。

> 仓库已含 `.nojekyll`，避免 GitHub 跳过资源文件；纯静态站点无需任何构建步骤。

## 加新路线

编辑 `assets/js/routes.js`，照现有格式加一个对象即可，页面会自动出现在下拉选单：

```js
{
  id: 'KMB-6-LCK',
  operator: 'KMB',            // KMB = 九巴/龙运稿，CTB = 城巴/新巴稿
  operatorZh: '九龍巴士',
  route: '6',
  accent: '#ff6a13',          // 电牌主色
  destZh: '荔枝角', destEn: 'Lai Chi Kok',
  originZh: '尖沙咀碼頭', originEn: 'Star Ferry',
  stops: [
    { zh: '尖沙咀碼頭總站', en: 'STAR FERRY TERMINUS' },
    { zh: '旺角豉油街', en: 'SOY STREET MONG KOK', note: '可在此站轉乘其他九巴路線' } // note 会触发转乘提示
  ]
}
```

## 语音说明

- 广东话用 `zh-HK`、普通话用 `zh-CN`、英语用 `en-GB`；装置缺少对应语音时会自动降级，页面底部会提示。
- iOS Safari / Chrome / Edge 支持较好；若首次无声，点一下画面再播一次即可（浏览器要求先有用户操作才允许发声）。
- 关闭「广东话」等勾选即可静音该语种，只留字幕。

## 数据来源与声明

- 报站用语格式参考九巴／龙运 BM-2013-KMB 与城巴／新巴 Telargo 报站系统的公开广播稿格式。
- 站名依据公开资料整理，可能与营运商最新公告有差异，请以官方为准，并可直接修改 `routes.js` 校正。
- 语音为浏览器合成音，**不是**官方录音，仅供学习与非商业用途。
