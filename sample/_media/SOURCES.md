# 網路下載測試素材

下載日期：2026-09-05。用途：本機 Magic Mirror 媒體測試。

| 檔案 | 內容 | 長度 | 處理方式 |
|---|---|---|---|
| bgm-spirit-in-the-woods-45s.wav | Spirit in the Woods，Alejandro Magaña (A. M.)，森林／合成器氛圍配樂 | 45 秒 | 取前 45 秒，淡入淡出，48 kHz 雙聲道 PCM WAV |
| bgm-forest-treasure-45s.wav | Forest Treasure，Alejandro Magaña (A. M.)，神祕森林配樂 | 45 秒 | 取前 45 秒，淡入淡出，48 kHz 雙聲道 PCM WAV |
| sfx-light-rain.wav | Light rain loop，Mixkit #1253 | 約 39.37 秒 | 原始 WAV |
| sfx-magic-sparkle.wav | Magic sparkle whoosh，Mixkit #2350 | 3.5 秒 | 原始 WAV |
| sfx-harp-sweep.wav | Relaxing harp sweep，Mixkit #2628 | 約 6.33 秒 | 原始 WAV |
| video-rain-leaves-embedded-audio-25s.webm | 綠葉上的水滴，內嵌雨聲 | 約 25 秒 | 720×1280、VP9 + Opus；原始 11.33 秒無聲影片重複至 25 秒，後製加入 #1253 雨聲 |

影片中的雨聲為後製配音，不是拍攝現場原音。影片重複處可能有畫面跳接，這支用於內嵌音訊與對話音量降低測試。配樂有淡入淡出，可測播放循環，但不是無縫音樂循環。

本次重點是補音訊與較長的內嵌音訊影片。原專案 resources/phase4-trial-assets 裡的無聲循環片、結尾片與靜態圖片可繼續使用，沒有搬移或覆寫。

## 來源與授權

- 配樂：https://mixkit.co/free-stock-music/ambient/ （Mixkit Stock Music Free License）
- 雨聲：https://mixkit.co/free-sound-effects/rain/ （Mixkit Sound Effects Free License）
- 魔法、豎琴：https://mixkit.co/free-sound-effects/magic/ （Mixkit Sound Effects Free License）
- 影片：https://mixkit.co/free-stock-video/water-droplets-on-green-bush-100925/ （頁面標示 Mixkit Video Free License）
- 各類素材授權原文：https://mixkit.co/license/

素材並非公有領域；Free License 各類型條款不同。本資料夾保留出處，授權範圍以原站對應條款為準。

## 原始下載網址

- spirit-in-the-woods.mp3: https://assets.mixkit.co/music/139/139.mp3
- forest-treasure.mp3: https://assets.mixkit.co/music/138/138.mp3
- green-bush.mp4: https://assets.mixkit.co/aev65mbfkc94yxhzxnxd16tzqdpc
- light-rain.wav: https://assets.mixkit.co/active_storage/sfx/1253/1253.wav
- magic-sparkle.wav: https://assets.mixkit.co/active_storage/sfx/2350/2350.wav
- harp-sweep.wav: https://assets.mixkit.co/active_storage/sfx/2628/2628.wav

## 檢查

media-info.json 記錄實際格式與長度。已對每個媒體檔執行完整解碼檢查；播放器互動、喇叭聽感與實際對話 ducking 仍需在應用程式中測試。
