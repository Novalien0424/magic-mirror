# 渡鴉大人：黑銀冷藍測試素材

以古老、沉靜、有威嚴的半神祇為方向：黑底銀灰雲霧、低沉合成器氛圍、短鐘聲喚醒，施法時才出現冷藍能量。避免待機音樂不斷堆高張力，讓中文對話仍是主角。這套是依網路素材剪輯的角色氣氛與功能測試版。

## 檔案與用途

| 檔名 | 長度 | 內容與搭配 |
|---|---:|---|
| idle.webm | 48 秒 | 有聲待機片；8 秒雲霧循環六次，內嵌與 bgm.wav 相同的完整配樂。設 loop。不要同時另播 bgm.wav，否則會重複疊音。 |
| wake.wav | 2.4 秒 | Bell of promise 的短鐘聲，淡出收尾。只播放一次，用於甦醒提示。 |
| spell.webm | 7 秒 | 冷藍粉霧凝聚、爆散、消散，後製嵌入 Magic astral sweep effect；只播一次，使用 video_complete 測回 Avatar。 |
| ending.wav | 14 秒 | 同一首配樂的尾段，淡入後收束至靜音。loop=false；若要接下一個 Stage，以 duration=14 秒安排。 |
| fog.webm | 8 秒 | 和 idle.webm 相同的雲霧；完全沒有音軌。設 loop，搭配 bgm.wav。 |
| bgm.wav | 48 秒 | Unforgiven 的循環剪輯，首尾交疊；設 loop。 |
| spell-silent.webm | 7 秒 | 和 spell.webm 相同的畫面，完全沒有音軌；隔離驗證影片結束與 Avatar 回歸。 |
| crop.png | — | 專案既有 360×640 測試圖，保留辨識圖樣，用於 Contain／Cover、尺寸和顯示切換。 |

所有影片均為 720×1280、24 fps、VP9 WebM；有聲版使用 Opus。WAV 為 48 kHz、16-bit、雙聲道。WebM 容器因音訊編碼延遲可能顯示多約 0.008 秒。

## 為什麼這些夠用

足以覆蓋本輪媒體功能：有／無內嵌音訊、獨立 BGM、有限／無限播放、影片自然結束、語音停止與替換、Stop All、靜態圖裁切。相同畫面的有聲／無聲版本可避免把素材差異誤認為播放器差異。

這不等於完整 Avatar 驗收：嘴型、傾聽／思考／說話／休眠動作、插話停止嘴型、喚醒詞與麥克風交接、離線恢復仍須實際語音與應用程式測試；燈光與煙霧硬體另測。素材本身不會把喚醒或 Dormant 狀態自動接上；本次沒有改動程式或場景設定。

## 建議測試順序

1. 音效裝置：播 wake.wav，確認喇叭輸出與音量，然後試真正的喚醒流程。
2. 單次影片：spell-silent.webm → spell.webm。各設定不循環、video_complete；播完回 Avatar，沒有卡住或突兀黑畫面。短片尾端有刻意消散至黑的特效收尾，應與播放故障區分。
3. 獨立循環：fog.webm + bgm.wav，兩者設 loop。連播至少三輪；說話時背景降低，說完恢復，無越播越大聲或重複疊音。
4. 內嵌音訊：只播 idle.webm，設 loop；持續交談 20–30 秒，確認 Avatar 隱藏時對話仍持續，內嵌配樂也會降低音量。
5. 停止／替換：第 3、4 種搭配分別測口頭停止、改播 spell、Stop All、接 ending.wav。結尾音樂不循環，也不應意外重啟待機音樂。
6. 顯示與狀態：crop.png 的 Contain／Cover；播放中進休眠、取消場景、模擬斷線，再確認恢復後狀態。OfflineLoop 可重用 fog.webm，待機與離線在產品中仍應有可辨識的狀態提示。

## 剪輯與檢查

- 雲霧：下載直式原片，取 10 秒做 2 秒首尾交疊，得到 8 秒循環；沒有倒放待機煙霧。
- BGM：使用原曲 15–67 秒，4 秒等功率首尾交疊，得到 48 秒循環。峰值約 -12 dBFS，保留對話音量空間；不是響度校準標準音。
- 待機：同一支雲霧循環六次，嵌入同一份 BGM。影片音訊為後製，不是煙霧原片現場聲。
- 施法：下載粉霧爆散原片，中央裁為直式，轉銀白冷藍；短暫倒放形成凝聚，再正放釋放並淡出。聲音為後製配音。
- 喚醒：Bell of promise 截為短提示，尾端淡出；峰值約 -8 dBFS。
- Ending：Unforgiven 原曲最後有效音訊附近取 14 秒，尾端淡出；峰值約 -10 dBFS。
- checks.json 保存長度、格式、雜湊與接縫數值。完整解碼、無聲音軌數、視訊配對與接縫已檢查；尚未做喇叭實聽、實際播放器無縫程度與即時對話驗收。

## 來源與授權（下載日期：2026-09-05）

- 雲霧：Swirling smoke with black background，Mixkit #1965。
  https://mixkit.co/free-stock-video/swirling-smoke-with-black-background-1965/
- 施法原片：Blue and green powder explosion in slow motion，Mixkit #51799。
  https://mixkit.co/free-stock-video/blue-and-green-powder-explosion-in-slow-motion-51799/
- BGM／Ending：Unforgiven，Michael Ramir C.，Mixkit #890；網站標籤為 Drone／Atmospheric／Synth／Religion／Space。
  https://mixkit.co/free-stock-music/mood/mysterious/
- 喚醒：Bell of promise，Mixkit #930。
  https://mixkit.co/free-sound-effects/magic/
- 施法聲音：Magic astral sweep effect，Mixkit #2629。
  https://mixkit.co/free-sound-effects/magic/
- crop.png：本專案 resources/phase4-trial-assets/phase4-still.png。原 README 說明為可隨專案修改與散布的確定性測試圖。

兩支網路影片頁面標示 Mixkit Stock Video Free License；音樂為 Stock Music Free License；音效為 Sound Effects Free License。各類用途依對應條款，不代表公有領域或可任意轉售原始素材。授權原文：https://mixkit.co/license/

