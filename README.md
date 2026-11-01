# 香港巴士報站模擬器 HK Bus Announcement Simulator

純靜態網頁，模擬香港巴士車廂報站系統。**路線與站名直接來自香港政府公開資料**（九巴／龍運 `data.etabus.gov.hk`、城巴 `rt.data.gov.hk`），全港所有九巴、龍運、城巴班次都能選；粵語 → 英語 → 普通話三語廣播、點陣式車廂顯示屏、下車鐘，語音由瀏覽器即時合成，無需任何音頻檔案與後端。

## 功能總覽

**真實路線資料**
- 全港九巴／龍運／城巴路線，輸入路線號或起訖站即可搜尋（例如 `1A`、`尖沙咀`、`Tsim Sha Tsui`）
- 去程／回程一鍵切換（⇄ 方向），可收藏常用班次
- 車站全表以 IndexedDB 快取 7 天，第二次開啟幾乎秒開；網路失敗自動退回內建路線，離線也能玩

**三語報站**
- 廣東話 → English → 普通話，與實車同序，任一語言可單獨關閉
- 依營辦商套用不同廣播稿：九巴／龍運（BM-2013-KMB 格式）與城巴／新巴（Telargo 格式）
- 歡迎辭、下一站、請緊握扶手、八達通轉乘提示、終點站告別語

**車廂顯示屏**
- 新款（8 字）／舊款（6 字）兩款點陣屏，站名過長自動分頁上捲（模擬走馬燈），英文自動折行
- 掃描線與橙字／黃字發光效果，隨營辦商切換主色

**行車控制**
- 開出總站、下一站、上一站、終點站、回首站、停止
- 自動行車：可設站間行車時間（0–90 秒），模擬真實車程節奏
- 沿途車站列表，點擊直接跳站

**其他**
- 全程進度條、接下來 3 站副屏、下車燈、下車鐘「叮—咚」與開門提示音（Web Audio 合成）
- 全屏模式、螢幕常亮（Wake Lock）、鍵盤快捷鍵
- 語速／音量／開關設定自動記憶

**快捷鍵**：`→` 下一站、`←` 上一站、`空格` 自動行車、`B` 下車鐘、`F` 全屏、`R` 切換方向、`Home` 回首站、`Esc` 停止

## 本地預覽

```bash
python3 -m http.server 8000   # 或 npx serve .
```

開啟 <http://localhost:8000>。**建議用本地伺服器開啟**，直接雙擊 `index.html` 時部分瀏覽器會擋掉 `fetch`，將只能使用內建離線路線。

## 部署到 GitHub Pages（約 1 分鐘）

1. 新建 GitHub 倉庫（例如 `hk-bus-announcement`），上傳本目錄全部內容：

```bash
git init
git add .
git commit -m "Add HK bus announcement simulator"
git branch -M main
git remote add origin https://github.com/<你的帳號>/hk-bus-announcement.git
git push -u origin main
```

2. 進入倉庫 **Settings → Pages**，Source 選 `Deploy from a branch`，Branch 選 `main`、目錄 `/ (root)`，Save。

3. 約 30 秒後開啟 `https://<你的帳號>.github.io/hk-bus-announcement/`。

> 已附 `.nojekyll`，純靜態無需任何建置步驟。GitHub Pages 是 HTTPS，瀏覽器才會允許語音與 Wake Lock。

## 加／改路線

- **線上路線**：由政府 API 自動取得，不需維護
- **內建離線路線**：編輯 `assets/js/routes.js`，照現有格式加一個物件即可：

```js
{
  id: 'KMB-6-LCK',
  operator: 'KMB',            // KMB = 九巴/龍運稿，CTB = 城巴稿
  route: '6',
  accent: '#ff6a13',          // 電牌主色
  destZh: '荔枝角', destEn: 'Lai Chi Kok',
  originZh: '尖沙咀碼頭', originEn: 'Star Ferry',
  stops: [
    { zh: '尖沙咀碼頭總站', en: 'STAR FERRY TERMINUS' },
    { zh: '旺角豉油街', en: 'SOY STREET MONG KOK', note: '可在此站轉乘其他九巴路線' } // note 會觸發轉乘提示
  ]
}
```

## 檔案結構

```
index.html
assets/css/style.css
assets/js/routes.js   內建離線路線
assets/js/data.js     政府 API 抓取、IndexedDB 快取、離線回退、收藏
assets/js/speech.js   三語語音合成、下車鐘／開門音
assets/js/app.js      介面與播放引擎
```

## 語音說明

- 廣東話用 `zh-HK`、普通話用 `zh-CN`、英語用 `en-GB`；裝置缺少對應語音時自動降級，頁面底部會提示
- iOS Safari / Chrome / Edge 支援較好；若首次無聲，先點一下畫面再播放（瀏覽器要求先有使用者操作才允許發聲）
- 語音為瀏覽器合成音，**不是**官方錄音

## 資料來源與聲明

- 路線、車站資料：香港政府資料一線通（`data.etabus.gov.hk`、`rt.data.gov.hk`）
- 報站用語格式：參考九巴／龍運 BM-2013-KMB 與城巴／新巴 Telargo 報站系統的公開廣播稿
- 站名以官方資料為準，但個別站名（尤其帶地區前綴者）與實車廣播可能略有差異
- 僅供學習與非商業用途，與各營辦商無任何關聯
