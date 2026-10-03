# 渡鴉大人 v09：動作／表情自我查核與修正

2026-09-09 清理註記：v9 獨立 Avatar／ZIP 已依使用者要求移除；本文保留為歷史紀錄，QA 路徑已更新。可用版本見 [v7／v8／v10 索引](C:/Project/magic-mirror/RAVEN-AVATAR-VERSIONS.md)。

2026-09-08。範圍：核對已交付資產、說明、實際 Core 畫面與相關程式。這次修改說明與 Avatar QA harness；v09 的 CMO、PSD、MOC、七個 motion、五個 expression 與 17 檔 runtime 均未改版。原 ZIP 是先前快照，最新說明以本文件及修訂後的主交付文件為準。

## 查核結論

原說明有不合理之處，已更正。尤其不能把 Body 參數說成真正「靠近觀眾」「收肩」，不能把同向傾斜說成反向，也不能把沒有 EyeOpen 的 Alert 說成強制睜眼。五個表情是眼瞼加姿態的組合，並非五種已經通過情緒辨識測試的臉部表情。

另外找到兩個實質問題：

1. **QA 的表情時間標錯。已修正。** 舊畫面標示 0、0.1、0.25、0.5、0.9 秒，但實際只走到 0、0.1、0.2、0.3、0.4 秒。五個檔案未自訂 FadeInTime，目前本機 Framework 預設 1 秒，因此原最後一幀不是完整表情。新 runner 使用正確時間差、最大 1/60 秒的 update step，核對 SDK 實際時鐘，重拍到 1.5 秒。五表情共 35 幀，最大時鐘誤差約 5.33e-15 秒。這是決定性取樣，不是 FPS 測試。
2. **大動作與完整姿態表情會互相限制。程式修法已交接，尚未實作。** 現有 product state mapping 把 Thinking 配 exp_05 等表情，兩者同時改 Head／Body。單獨檢查動作和表情都能動，不代表疊加後保留同樣幅度。35 種靜態配對都有至少一個共享姿態參數會超過範圍；這不是 35 種組合都在每一幀失敗，也不是全部都已在 Console 播放測試。

![完整淡入後的五個表情，最左是 neutral](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/five-expressions-settled.jpg)

## 七個 Motion：修正後的設計原則

Head X=0 是原本約 45°；-30 朝觀眾，+30 更偏側。這是本角色的參數映射，不是實際世界角度。循環／單次列的是檔案的 Meta.Loop；Console 的單次預覽和產品播放政策可覆寫它。

| Motion | 檔案設計 | 可證明的動作與目的 | 自我查核修正 |
|---|---|---|---|
| Dormant／待機 | 12 秒循環 | 偏側、稍低頭，低幅度頭身往返與慢呼吸，維持安靜感。 | 是清醒待機；沒有自行閉眼，也沒有真實物理重心模擬。 |
| Waking／甦醒 | 3 秒單次 | 從低頭偏側抬起，中段短暫轉向觀眾側，最後回 45°，表達注意到使用者。 | 保留名稱；是姿態過渡，不是已驗證的喚醒偵測功能。 |
| Listening／聆聽 | 8 秒循環 | 頭部長時間在觀眾側，抬頭並緩慢調整傾斜；以面向和停留時間表達注意力。 | 頭身 Z 曲線同為負，應寫同向傾斜；刪除前後靠近之說。 |
| Thinking／思考 | 7 秒循環 | 另一端偏側視角，抬頭並緩慢調整頭身傾斜，與 Listening 形成面向差別。 | 刪除沒有獨立造型依據的「收肩」及過度具體的「兩次重心轉移」。 |
| Speaking／說話 | 3.6 秒循環 | 較快的頭部俯仰和側傾交替，身體配合擺動，提供肢體節拍。 | 不開喙；真正嘴型仍由音訊 lip-sync 驅動，也不保證點頭會跟每個音節同步。 |
| Scene／姿態展示 | 10 秒循環 | 在觀眾側與偏側之間做多段較大的姿態轉換。 | 頭身有同向與反向區段，不宜一概稱同步；這是通用展示循環。 |
| Suspending／收尾 | 3.2 秒單次 | 由觀眾側降低姿態、轉向偏側，最後回 45°。 | 是收尾過渡，不是停在閉眼、低頭的睡眠狀態；後續待機由產品決定。 |

七組曲線有不同時長、角度範圍與節奏，並非同一曲線換檔名。但內部段落目前是線性插值，不能因此宣稱已具有完美的加減速或自然表演質感。循環的首尾數值相接，也不等於速度完全連續。

## 五個 Expression：修正後的用途

以下數字是單獨從 neutral 完整淡入後、Core 實際讀到的參數；不是眼睛可見面積百分比，也不是與任何 motion／blink 疊加後都固定如此。

| ID | 修正後的對外說明 | 可見設計 | 限制與合理判斷 |
|---|---|---|---|
| exp_01 | **溫和專注**（Attentive） | EyeSmile=1、EyeOpen≈0.92；抬頭、傾頭，眼神柔和、帶笑意。 | EyeSmile 是最大值，不能把整體寫成「只有輕微收眼」。沒有向鏡頭前移。 |
| exp_02 | **側頭探問**（Curious） | EyeSmile=0.85、EyeOpen≈0.82；朝觀眾側偏轉、抬頭並傾斜。 | 頭身 Z 偏移同向。是鳥類側頭探問的藝術解讀，不是睜大眼驚訝。 |
| exp_03 | **低頭休息**（Resting） | EyeOpen≈0.30；頭身降低、偏側，畫面接近閉眼休息。 | Add -0.7 會令底層眨眼較早夾到 0；不是一段固定長度的 blink 動畫。 |
| exp_04 | **朝向警覺**（Alert） | 朝觀眾側偏轉，頭部下壓並傾斜，形成定向注意。 | HeadY=-14，不是抬頭。沒有 EyeOpen 項，不會強制睜眼；預覽睜眼來自 neutral。 |
| exp_05 | **玩味打量**（原意圖 Skeptical） | EyeSmile=0.95、EyeOpen≈0.65；抬頭偏側，頭身反向傾斜。 | 沒有挑眉／皺眉；強 EyeSmile 更像帶保留的打量。保留 exp_05 ID，只修正語意說明。 |

Agent 對新圖的觀察：休息與警覺輪廓差異清楚；探問有不同面向與傾斜；專注與玩味打量的眼部造型仍相似，主要以身體傾斜和頭部方向區分。**改名稱並沒有修復這兩者的視覺相似性，不宣稱五種情緒皆可一眼辨認。** 若下一步要求五種臉部情緒本身明確不同，應另外修訂眼瞼 keyform／表情資產，再做同姿勢比較，而非只增加頭身偏移。

Expression 是固定目標偏移，淡入淡出由 SDK 管理。Add、Multiply、Overwrite 對眨眼有不同影響；Add 負值會延長閉眼夾限區間，Multiply 可按比例保留原 blink 波形，Overwrite 會接管眼開度。本次不把目前 Add 一律判為格式錯誤。[Live2D 官方表情混合說明](https://docs.live2d.com/en/cubism-sdk-manual/expression/)

## 交給 Coding Session：共享姿態參數的完整處理方式

### 本次查到的程式與根因

- [avatar-model-source.ts](C:/Project/magic-mirror/src/renderer/avatar/avatar-model-source.ts)：`REN_EXPRESSIONS` 把 Dormant／Suspending 配 exp_03，Waking／Listening／Speaking 配 exp_01，Thinking 配 exp_05，Scene 配 exp_02。
- [cubism-avatar.ts](C:/Project/magic-mirror/src/renderer/avatar/cubism-avatar.ts)：`setState()` 無條件查 `renExpressionForState(state)`，對有同名表情的 Raven 也生效；`update()` 先算 motion、保存參數，再算 physics／breath／blink／expression。
- Raven 的 exp_01…05 都含頭／身／呼吸 Add 偏移。Thinking 的 HeadX 範圍 +18…+28，再加 exp_05 的 +20，就要求 +38…+48；Core 最後只能給 +30。原本 10 個單位的轉頭變化因此可能整段消失。這是有具體來源的飽和機制，不是把所有「動作小」都歸咎於同一原因。

**已用真正 Core 確認一個實例**：Thinking 單獨在 1.75／3.5／5.25 秒的 HeadX 分別為 26／20／28；加 exp_05 後，同三個時間全為 30。Listening + exp_01 在 4 秒的 BodyX 夾到 -10；Scene + exp_02 在 2.5 秒的 HeadX／BodyX 分別夾到 -30／+10。這些是隔離 Core 的實際組合結果，產品的其餘 effects 和狀態切換仍由 Coding Session 驗證。

![Thinking 單獨與疊加 exp_05 的實際 Core 對照](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/thinking-expression-clamp.jpg)

### 建議實作：保留完整姿態預覽，狀態自動表情只負責臉部

1. **將 state-expression 選擇綁定目前模型的明確設定。** 讓 Ren 保留自己的 mapping；Raven 使用自己的 mapping。缺少設定的模型預設不自動套任意 `exp_01` 等名稱。不要以檔名碰巧相同當成語意相同，也不要綁死本機 import UUID。
2. **載入 Raven exp3 時建立兩套獨立的 CubismExpressionMotion 物件。** 原始五檔保留供使用者選擇完整姿態；state 用的物件從同一份 JSON 衍生，只保留 `ParamEyeLOpen`、`ParamEyeROpen`、`ParamEyeLSmile`、`ParamEyeRSmile`。保留各項 Blend、Value 與 fade 設定。不要修改或覆寫磁碟上的原始 exp3，也不要在同一個 motion 物件上暫時改參數。
3. **`setState()` 啟動 state 專用物件。** 仍可採上面的 Raven mapping；Head X/Y/Z、Body X/Y/Z、Breath 全交給狀態 motion／既有 effects，避免大幅姿態相加。明確選擇完整表情預覽時，先 Stop/reset，再啟動原始 exp3，以便使用者看到可重現的獨立姿態。
4. **不要縮小全部 motion，也不要每幀 auto-fit。** 這會把使用者要求的活潑度又拿掉。暫時無法建立 face-only state 物件時，可先讓 Raven state 的自動 expression 為 null，保留單獨表情預覽；不能繼續把完整姿態 exp3 無條件疊上去。
5. **追蹤留在獨立混合政策。** 本次修法只解決已知的 motion + expression 衝突。未來 gaze／head tracking 應另定 ownership、平滑與可用範圍，不能把一次 clamp 當成完整追蹤設計。

衍生 JSON 的核心邏輯如下；由 Coding Session 配合現有 loader 型別整合：

```ts
const stateFaceIds = new Set([
  'ParamEyeLOpen', 'ParamEyeROpen',
  'ParamEyeLSmile', 'ParamEyeRSmile',
])
const stateExpressionJson = {
  ...rawExpressionJson,
  Parameters: rawExpressionJson.Parameters.filter(p => stateFaceIds.has(p.Id)),
}
// 原始 JSON 和衍生 JSON 各自 loadExpression，放入不同 Map。
// setState 查模型自己的 mapping + state Map；顯式完整預覽查原始 Map。
```

這會保留七動作的頭身幅度及既有 state 眼部意圖；不保證五種 face-only 表情都不同。特別是 exp_04 沒有 EyeOpen，且沒有被上述自動 mapping 使用，其完整警覺姿態仍屬手動預覽。

### 最小驗證清單

1. Node 層驗證衍生 JSON 不寫 Head／Body／Breath／gaze／mouth，原始 JSON 不變；模型自己的 mapping、缺少表情時的 null、Ren 原 mapping 均符合預期。
2. 實際 Core 同時間比較 Thinking 單獨與 Thinking + state exp_05：HeadX 應保留 +18…+28 的變化，不再整段停在 +30。比較 Listening + state exp_01、Scene + state exp_02 的 Head／Body 也應與各自 motion baseline 相符。其他 effects 設定保持相同。
3. 五個 state 眼部偏移若有使用，逐一觀察 open／half／closed blink：不應把閉眼硬拉開；另確認 gaze 和音訊嘴型仍由原通道控制。眼開度 Add 的閉眼時間感仍須視覺判斷。
4. 既有 Console 上測原始完整表情仍能選、Stop/reset 能復原；Raven 狀態播放採衍生表情。檢查當前 9:16 Layout 與 +30 喙尖既有修正保持。這是待 Coding Session 完成的產品驗證，本次沒有代為執行。

## 已保存的證據與本次限制

- [主交付說明](C:/Project/magic-mirror/RAVEN-V09-BEAK-FIX-AND-MOTION-DESIGN.md) 已同步修正文案。
- [查核資料](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/semantic-audit.json)：七動作曲線點、五表情的完整參數、35 配對的靜態越界範圍、檔案 SHA-256。
- [35 幀新表情矩陣](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/expression-captures/capture-matrix.json)：實際參數、SDK 時鐘、drawables、PNG。
- [舊錯誤時間與新完整淡入對照](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/expression-time-correction.jpg)。舊 PNG 保留，沒有竄改時間標籤冒充重測。
- `before/` 保存修訂前文件與 runner。既有 v08 回復包、v09 runtime ZIP／complete ZIP 保留。
- 補拍 17 幀局部 Core 檢查，並逐檔核對服務端與交付的 17 個 runtime 檔 SHA-256，全數相符。[局部檢查記錄](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa/semantic-audit-20260908/semantic-checks/checks.json) 包含上述疊加實例。
- `neutral-after` 原證據是硬 reset；本次另在播放中不 reset，確認 Waking 於 3.6 秒、Suspending 於 3.8 秒已 finished，Head／Body 回到 0，並查看其 neutral 畫面。這只證明隔離 Core 以 neutral 基底播放的自然完成，不代表產品下一個 state 的銜接或所有循環已驗證。
- 本次為 `static`、`actual-runtime` 和 `visual-agent`，使用者美感驗收 `visual-human: not_run`。沒有切換主 Mirror，也沒有修改 app code／語音／SDK。

Installed skill 已修正 runner 的時間、完整淡入取樣、端點方向文字與圖片路徑；另加入時間軸回歸測試與說明自我查核規則。不要再次把數值變化、檔名、作者的情緒意圖或 agent 看圖升級成人類接受度通過。
