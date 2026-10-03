# 可攜式 Runtime QA harness

需要對真正匯出的 `.moc3` 做 Core render 驗證時，使用技能內的
`scripts/runtime-qa/`。它只讀取已匯出的 runtime 和專案既有的 Core／Framework，
不製作或修改 `.cmo3`、`.moc3`、PSD、Magic Mirror，也不啟動 Electron 或瀏覽器。

## 輸入與啟動

先把 Cubism 匯出包放在新的 runtime 目錄，並以舊 runtime 作為 baseline。Vite
服務必須明確收到這些路徑：

```powershell
$env:RAVEN_MODEL_ROOT = 'C:\path\to\fresh-runtime'
$env:RAVEN_PROJECT_ROOT = 'C:\path\to\magic-mirror'
$env:RAVEN_QA_PORT = '4177'
node 'C:\path\to\magic-mirror\node_modules\vite\bin\vite.js' `
  --config 'C:\Users\b8901\.codex\skills\magic-mirror-avatar-studio\scripts\runtime-qa\vite.config.mjs'
```

`RAVEN_MODEL3` 只在 runtime 有多個 `.model3.json` 時指定。單一 model3 會被
服務映射成 `/runtime/model3.json`，所以角色檔名不必叫 Raven。`RAVEN_PROJECT_ROOT`
必須包含 `src/vendor/live2d/Core/live2dcubismcore.min.js` 和 Framework shader。

先做檔案級檢查，再做真實 Core capture：

```powershell
$h = 'C:\Users\b8901\.codex\skills\magic-mirror-avatar-studio\scripts\runtime-qa'
node "$h\preflight-v08-runtime.mjs" --model-root $env:RAVEN_MODEL_ROOT `
  --baseline 'C:\path\to\old-runtime' --output 'C:\path\to\qa\preflight.json'
node "$h\run-v08-qa.mjs" --model-root $env:RAVEN_MODEL_ROOT `
  --output 'C:\path\to\qa\captures' --baseline 'C:\path\to\previous-qa' `
  --cdp 'http://127.0.0.1:4188' --url 'http://127.0.0.1:4177/capture.html' `
  --canvas-width 1280 --canvas-height 1672
node "$h\capture-diagnostic-grid.mjs" --url 'http://127.0.0.1:4177/capture.html' `
  --output 'C:\path\to\qa\diagnostic' --cdp 'http://127.0.0.1:4188' `
  --canvas-width 1280 --canvas-height 1672
```

`--width`／`--height` 是 CDP viewport；`--canvas-width`／`--canvas-height` 會
實際設定並驗證 WebGL canvas。省略後者時才沿用 viewport 值。runner 若發現
頁面實際 canvas 尺寸不同會停止，避免把只改 viewport 的圖片當成原尺寸 QA。
`capture-diagnostic-grid` 會保存 head X 中間路徑、Head X/Y 的 3×3 變形格、兩個斜角
開嘴狀態、側／中／正面嘴巴五段開合，以及側面和正面各一組 3×3 gaze grid。
`run-v08-qa` 另保存所有控制端點、motion、
expression、neutral return、drawable/mask/alpha metadata。

局部修正表情時可加 `--only expressions`，只取 neutral 與表情時間軸。runner
以最多 1/60 秒的 update step 推進，讀取實際 expression manager elapsed，比對
每個 sample label，並依已載入表情的 FadeInTime 加入完全淡入後的取樣。
這是決定性時間取樣，不是即時 FPS／效能測試。`neutral-after` 的
`resetMethod: hard-reset` 不代表已驗證自然淡出；另跑不中斷的完成時間軸。
舊 runner 的 0.9 秒表情標籤曾實際只有 0.4 秒；保留舊證據並註記失效範圍，
不可只改圖上時間或沿用其完整表情結論。

組合 QA 注意：目前 `window.__capture.setParameters()` 會先 stopMotions，連帶
停止 expression；全域 `setParameter()` 包裝也呼叫它。表情播放後若要加 gaze／head
診斷 override，可用已載入 `model.setParameter(id,value)`，它只設 manual override。
每幀另外核對 EyeOpen／EyeSmile 的實際值，確保不是把表情停掉後誤稱組合通過。
測 blink 的 Add／Multiply 必須在 expression manager 之前提供 blink input；在最後
寫 EyeOpen override 只能證明 preview 覆寫成功，不能證明表情保留了眨眼波形。

## 判讀規則

### 構圖與裁切

先唯讀核對產品當前的 projection／model matrix。Magic Mirror 現行做法是初始化
一次 model height 與 model3 `Layout`，draw 時只乘 viewport aspect；harness 不可
再依 export canvas width > 1 切換 width-fit，也不可在 draw／resize 改 model matrix。
原始 Cubism 畫布與實際直式畫面是兩個不同的驗收尺寸：Editor 內看得到喙尖，
不代表 9:16 Console 看得到。至少保存真正 1080×1920（或指定比例）的 neutral、
兩端點，以及 Head X/Y/Z × Body X/Y/Z × Mouth 的相關極值組合。

若已裁切，僅看畫面內 alpha bbox 無法知道缺多少。可用同高度、更寬的 overscan
診斷圖量測缺口，再映射回置中的 production viewport；診斷圖不可當成實際畫面
通過。要用部件或明確 ROI 區分喙／臉與半身構圖原本就會裁掉的肩、衣服、尾端
羽毛，同時人工檢查另一侧，避免只把左邊問題移到右邊。有限抽樣不能宣稱連續
參數空間的數學保證。固定 model3 `Layout` 是可編輯的角色構圖資料，需與 runtime
一起保存；不應用每幀 auto-fit、降低所有動作幅度或重設產品投影掩蓋局部问题。
官方參考：[模型位置與縮放](https://docs.live2d.com/en/cubism-sdk-manual/layout/)。

每次 capture 記錄實際服務端 MOC／model3 的雜湊並比對本次輸出。資料夾叫
`native-check` 不代表裡面已更新；中斷的複製可能仍保留 baseline。失配時先標記
成 baseline 證據，完成複製後重新載入並捕捉，不能只改報告中的版本字樣。

`preflight` 的 `ready_for_core_qa` 只代表引用檔存在且 MOC 雜湊不同；它不是
視覺通過。必須查看實際 Core screenshot，且在預定顯示尺寸檢查：

- 45° neutral 到正面端點的每一格只有一個連續頭部／喙，不能只推出喙、整頭淡入、
  中途雙喙或四眼。
- pitch、tilt、body X/Y/Z、blink、EyeSmile、兩眼 gaze 和 beak 開合都要有可辨識
  的畫面差異。極值 gaze 必須仍能辨認 pupil；不要求完整 iris 圓形。
- 嘴巴必須以黑、白、checker 背景查看 closed→open 逐格 alpha；metadata 或
  單一透明像素不能代替畫面檢查。
- 每個 motion／expression 查看 strongest frame 與 neutral-after；靜態曲線 delta、
  舊版非零變化和 synthetic harness 都只能找疑點，不能升級成視覺通過。

執行不需要瀏覽器或模型的 smoke check：

```powershell
node "$h\test-run-v08-qa-args.mjs"
node "$h\test-portable-harness.mjs"
node "$h\test-expression-timeline.mjs"
```

前兩個測試會確認 `--help` 不建立 capture 目錄、缺少 model root／output 會拒絕，
以及 actual canvas 尺寸、model3 路徑與 project path 沒有偷偷回退到舊 Raven 專案。
第三個直接執行 runner 的 expression 區段，以可控 clock 驗證不均勻時間標籤
與實際推進一致，且包含完整淡入後取樣；它是 synthetic-harness 證據。
