# 渡鴉大人 v09：喙部裁切修正與動作設計

2026-09-09 清理註記：v9 獨立 Avatar／ZIP 已依使用者要求移除；本文保留為歷史紀錄，QA 路徑已更新。可用版本見 [v7／v8／v10 索引](C:/Project/magic-mirror/RAVEN-AVATAR-VERSIONS.md)。

2026-09-08，Windows 實作與驗收。此文件交給管理 Magic Mirror 程式的另一個 session。

2026-09-08 晚間自我查核修訂：動作／表情說明、表情 QA 時間與證據層級已更正。
詳見 [自我查核與程式交接](C:/Project/magic-mirror/RAVEN-V09-MOTION-EXPRESSION-SELF-AUDIT.md)。
本次說明修訂沒有更換 v09 的 17 個 runtime 檔；先前 ZIP 保留為原交付快照，最新說明以本文件與自我查核文件為準。

## 交付結果

v09 已從真正 Cubism Editor 5.3.04 保存、匯出，並經既有 Console 正常匯入、顯示。
`ParamAngleX=+30` 不再切掉左側喙尖。本次只改 Avatar 資產與技能；產品投影修正由另一個 session 完成。
未發布 Appearance 草稿、未切換主 Mirror、未改 Magic Mirror 程式／語音／SDK，也未啟動第二套 Electron。

- 匯入檔：[raven-lord.model3.json](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09/runtime/raven-lord.model3.json)，必須與同目錄完整 17 個 runtime 檔一起使用。
- 可編輯來源：[raven-lord-v09.cmo3](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09/cubism/raven-lord-v09.cmo3)。4 份分層 PSD 仍是已驗證的 v08 美術來源，位於 v09/source；v09 沒有重繪原圖。
- 本次 Console library ID：`model-8cb13e76-a05d-4b20-afc4-1b116c8524dd`。已比對全部 17 檔與交付／Core 測試副本完全相同。
- Runtime ZIP：[raven-lord-v09-runtime.zip](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09-runtime.zip)。完整來源及代表性 QA：[raven-lord-v09-complete.zip](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09-complete.zip)。所有逐幀證據另存於 v09/qa/final-captures。

## 原因與正確修法

先前「人物突然變小」是產品以 export canvas width > 1 選到 width-fit 的問題；目前程式已改為高度與 authored Layout 決定模型矩陣，繪製時只處理 viewport aspect。
比例恢復後，v08 的長喙在 1080×1920 真正畫面、Head X +30 時超出左界約 39 px。
Cubism Editor 的 1280×1672 工作畫布較寬，在 Editor 看得到不代表直式 Console 也看得到。

本次修正分兩處：

1. **CMO 內的姿勢修正**：選擇頭部父 Warp `HeadXY_ThreeQuarter`（ID `Warp2`），只在 `ParamAngleX=+30` 的 keyform 將整頭向右移。此電腦 49.1% Editor 畫面實際平移 20 px；Core 同高度渲染量到 +30 喙尖約向右 71 px。操作針對包含眼、上下喙與遮罩的共同頭部父層，避免只推喙或破壞嘴內 alpha。X=0 的原始 45° 與 X=-30 正面 keyform 不變，0→+30 仍由 Cubism 插值。
2. **角色專屬固定構圖**：只修頭部時，+30 單軸已有 32 px 餘量，但疊加最大左傾身與傾頭仍會出界。故 model3 加入以下 Layout，使用既有 Framework 正常讀取：

```json
"Layout": { "height": 1.9, "x": 0.17, "y": -0.05 }
```

這保留原高度構圖的 95% 尺寸，固定向右留出長喙的活動空間，並將底部對齊直式畫面。
小寫 `height/x/y` 是目前 Framework 實際讀取的鍵；不要改為 `Height/X/Y`，也不要誤用有不同語意的 `center_x`。
不需要再修改 app code。不要把 Layout 重複乘兩次、在 draw/resize 重設 model matrix，或用每幀 auto-fit 造成播放時縮放。
官方原理：[模型顯示位置與縮放](https://docs.live2d.com/en/cubism-sdk-manual/layout/)，並已核對專案本機 CubismModelMatrix 的 setupFromLayout 實作。

**構圖取捨**：優先保住喙、眼與臉的主要辨識部位。半身人物的肩、衣服、後側長羽毛仍會被直式邊緣裁掉；尤其全身體右傾極值，後腦外輪廓與後頸羽毛會較靠近／越過右緣。這不是全角色輪廓在任意參數組合都完整入框的保證。不要把本次「喙部左界修正通過」擴大寫成「全身所有邊界通過」。

## 保存與後續修改方式

在 Cubism 開啟 v09 CMO 可改 Deformer、ArtMesh、參數形狀。4 份 PSD 可回 Photopea 修改素材。
本次沒有 CAN3；七個 motion3 與五個 exp3 是可編輯 JSON。
重新匯出時保留原 PPU 941、中心 0.5/0.5、SDK 5.0 相容格式、2048 atlas。把新的 MOC、atlas、physics、cdi 放進新版本 runtime，再保存包含 motions、expressions、EyeBlink、LipSync 與上述 Layout 的 model3。
**不要直接以 Editor 原始 model3 覆蓋交付 manifest**：Editor 匯出檔不包含本次自訂七動作、五表情與固定 Layout。另存版本、靜態驗證引用、核對實際服務的 MOC/model3 雜湊後，再做 Core 與 Console QA。
本次 MOC SHA-256：`3065d7339eb57762e282016eb81a1f1894c05f224d1180cc47ee86f71b060de0`。

## 七個 Motion 的設計原則

保留 v08 已放大的動作曲線；v09 修正構圖與 +30 姿勢，沒有把動作幅度縮回去。
`ParamAngleX=0` 是平常 45°；`-30` 朝觀眾，`+30` 更偏側。參數數值不是世界座標中的真實角度。

| Motion | 時長 | 角色表現與設計原則 |
|---|---:|---|
| Dormant／待機 | 12 秒循環 | 偏側、稍低頭，以低幅度頭身往返和慢呼吸維持安靜感。是清醒待機，不等於閉眼睡眠。 |
| Waking／甦醒 | 3 秒單次 | 由低頭偏側姿態抬起，短暫轉向觀眾側，再回 45° neutral；以一次姿態展開表達注意到使用者。 |
| Listening／聆聽 | 8 秒循環 | 較長時間朝觀眾側，抬頭，頭身同向傾斜並慢慢往返。用面向與持續時間表達注意力。沒有真正的鏡頭前後移動。 |
| Thinking／思考 | 7 秒循環 | 保持另一端的偏側視角，抬頭並緩慢調整傾斜。以與 Listening 不同的面向和節奏表達思考；沒有獨立收肩動作。 |
| Speaking／說話 | 3.6 秒循環 | 頭部俯仰與側傾交替，身體隨節奏擺動，作為說話時的肢體節拍。此 motion 不控制開喙；真正嘴型仍需音訊 lip-sync。 |
| Scene／姿態展示 | 10 秒循環 | 以多段頭身姿態在觀眾側與偏側間轉換，變化較大、較慢。是通用展示循環，不表示已為特定場景編排動作。 |
| Suspending／收尾 | 3.2 秒單次 | 由觀眾側姿態降低並轉向偏側，最後回 45° neutral，作為互動收尾；不是停在閉眼／低頭睡眠姿勢。 |

## 五個 Expression 的用途

Expression 是疊加的態度／姿勢偏移，不是另一支循環動作。鳥類臉部用眼瞼、瞇眼、頭頸和肩線表現，沒有添加人類露齒笑。
下表是單獨從 neutral 播放並完成淡入後的姿態與意圖，不能直接當成與任何 motion 疊加後的結果。
完整淡入後的 35 幀已重拍。exp_01 與 exp_05 的眼部語彙仍相近，不能宣稱五種情緒皆能一眼辨認；這兩者主要靠頭身姿勢區分。使用者美感驗收尚未進行。

| ID | 名稱 | 設計內容 |
|---|---|---|
| exp_01 | Attentive／溫和專注 | EyeSmile 到 1，眼開度約 0.92；抬頭並傾頭，呈現柔和、略帶笑意的專注。沒有前移或拉近鏡頭。 |
| exp_02 | Curious／側頭探問 | EyeSmile 0.85，眼開度約 0.82；向觀眾側偏轉並抬頭，頭身同向傾斜，呈現探問姿態。不是驚訝式睜大眼。 |
| exp_03 | Resting／低頭休息 | 眼開度約 0.30，頭身降低、轉向偏側；完整畫面接近閉眼休息。眼開度參數不等於可見眼睛面積百分比。 |
| exp_04 | Alert／朝向警覺 | 向觀眾側偏轉、頭部下壓並傾斜，呈現定向注意；不寫 EyeOpen，不能強制睜眼或阻止 blink。不是抬頭驚訝。 |
| exp_05 | 原標籤 Skeptical；修正說明為「玩味打量」 | EyeSmile 0.95，眼開度約 0.65；抬頭、偏側並使頭身反向傾斜。較像帶保留的打量，沒有挑眉或皺眉。保留 exp_05 ID，不以改名冒稱視覺已改善。 |

## 動作與追蹤如何共存

- State motions 控制 Head X/Y/Z、Body X/Y/Z、Breath；不寫 gaze、blink、mouth。
- Expressions 用 Add 偏移 eye-open／EyeSmile 與頭身姿勢；不寫 gaze 或 MouthOpenY。不同 expression 的淡入淡出與疊加仍由產品管理。
- 當前產品 `renExpressionForState` 也會套用到 Raven：例如 Thinking + exp_05。大幅頭身 motion 加完整姿態 expression 會 clamp；本次靜態掃描 35 種配對均有至少一個共享姿態參數存在越界區段。因此「不寫 gaze／mouth」不代表所有控制都無衝突。具體程式修法與驗證見自我查核文件。
- Gaze X/Y 保留 -1…1；EyeOpen／EyeSmile／MouthOpenY 保留 0…1。Head X/Y/Z 是 -30…30，Body X/Y/Z 是 -10…10。
- 追蹤與 motion 共用頭部參數時，產品 session 必須決定混合優先順序、平滑與 clamp；本次沒有驗證自然對話、攝影機視線追蹤、語音延遲或整個產品狀態機。

## 本次證據與限制

- v08 原版同高度 overscan：單獨 Head X +30 喙尖約超出 39 px；局部姿勢修正後，無 Layout 時餘量 32 px。
- v09 最終固定 Layout：真正 1080×1920 單獨 +30 左界餘量約 220 px；579 個組合抽樣中，保守頭部 ROI（畫面上方 46%、alpha>=32）最小左餘量 28 px。ROI 包含喙部，不以衣服 bbox 代替喙的證據。有限抽樣不等於所有連續參數的數學保證。
- Core 6.0.1 已做 MOC 5.0 consistency check，22 drawables／27 parameters；17 runtime 檔引用完整，7 motions／5 expressions 正常載入。
- 原有 34 個控制畫面、11 個轉頭插值畫面、10 個組合姿勢與 42 motion frames 保留。原 25 expression frames 的時間標籤有誤：最後標成 0.9 秒，實際為 0.4 秒；不能據此宣稱完整淡入 QA。已修正 harness 並重拍 35 幀至 1.5 秒，另存 `qa/semantic-audit-20260908/expression-captures`。
- 視覺檢查由 agent 執行，非人類驗收。已查看七動作 filmstrip 與新表情完整淡入比較圖；exp_01／exp_05 相近與配對夾限另列限制。原 neutral-after 是硬 reset 的證據，不是自然完成／淡出證據。
- Console 已實際顯示本次 neutral、+30、-30；完成後 Stop/reset 留在 45° neutral。證據 `qa/console-v09-*.jpg`。
- v08 的中間角度喙根暗接縫、正面眼睛較圓、blink patch 與極端 gaze 的虹膜部分遮蔽仍存在；本次沒有重繪它們。後側羽毛／肩部裁切的取捨見上文。
- 對照官方 Haru 的格式檢查沿用 v08 已下載參考；本次另行重新跑完整 17 檔 validator，不冒充本次重下載官方素材。

## 回復 v08

改動前已逐檔驗證 v08 的 25 個來源／runtime 檔與 ZIP，另存回復包：
[rollback-v08.zip](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-backups/v08-before-beak-clearance-20260908T143026Z/rollback-v08.zip)。
原本 `outputs/raven-lord-v08` 與 v08 managed import 均保留。回復時由 Console 選原 v08，或重新匯入其 model3；不用覆寫目前 managed library。

## 技能／harness 改善

Installed `magic-mirror-avatar-studio` 的 Core QA draw 已同步產品的 height + Layout，移除舊 width-fit 分支。
補入真正 9:16、同高度 overscan、模型雜湊、組合極值與左右邊界人工檢查原則。
參數／路徑 smoke 與 UTF-8 skill validator 已通過；本次 Core capture 提供實際模型驗證。
自我查核另外修正 expression clock、加入完整淡入取樣、修正 QA 端點方向與錯誤圖片路徑，並加入先失敗後通過的時間軸回歸測試。完整結果見自我查核文件。
一次用途的 `beak-clearance.mjs` 保留於工作目錄及交付 QA，明確綁定此 Raven／1080×1920 ROI，未冒充通用臉部辨識器。
