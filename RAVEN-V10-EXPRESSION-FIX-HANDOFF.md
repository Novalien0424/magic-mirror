# 渡鴉大人 v10：第五表情修訂與 Console 驗證

2026-09-09 儲存位置更新：[專案 v10 master](resources/avatar/Raven/README.md)
已保存完整交付且 SHA-256 相符。請由
[專案 model3](resources/avatar/Raven/v10/runtime/raven-lord.model3.json) 匯入；
可編輯 CMO／PSD、QA 亦在該 v10 目錄。本文原始 outputs 連結為歷史來源，
未刪除原件，也未改 runtime 或既有 Console managed copy。

2026-09-09。v10 已在現有 Windows Console 匯入並顯示。這次修正 exp_05 與 exp_01 笑眼過於相似；七個 motion、其他四個 expression、Cubism 網格、貼圖及構圖沿用 v09。Magic Mirror 產品程式仍交由另一個 coding session 負責。

後續版本清理：依使用者要求只保留 v7／v8／v10。以下備份及 v09 比對描述是修訂當時的驗證紀錄；v09 獨立模型與 rollback 已移除，現行回復方式見 [保留版本索引](C:/Project/magic-mirror/RAVEN-AVATAR-VERSIONS.md)。v10 必需的 CMO、PSD 和 runtime 都保留。

## 本次改動與理由

17 個 runtime 檔案只有 `motions/exp_05.exp3.json` 改變：

| 參數 | v09 | v10 |
|---|---|---|
| ParamEyeLSmile / ParamEyeRSmile | Add 0.95 | Add 0 |
| ParamEyeLOpen / ParamEyeROpen | Add -0.35 | Multiply 0.85 |

exp_05 定位為 **謹慎打量／保留態度**：保留偏側抬頭、頭身反向傾斜的姿態，移除這個表情增加的笑眼。不是挑眉或皺眉；本模型 Brow 參數在先前局部探測中沒有畫面效果。Add 0 代表不添加笑眼，不是強制清除其他來源的 Smile。

先比較較窄的不帶笑眼眼型，並以 Multiply 0.65 做完整組合檢查；發現斜向看時虹膜太少，最終放寬至 0.85。這是參數乘數，不是眼睛可見面積百分比。完整淡入後，底層 blink 的 1、0.75、0.5、0.25、0，分別得到 0.85、0.6375、0.425、0.2125、0；三種頭部角度共 15 筆 SDK 實測符合，閉眼不會被拉開。乘算用來按比例保留底層眼開度變化。[Live2D 官方表情混合說明](https://docs.live2d.com/en/cubism-sdk-manual/expression/)

![專注、舊第五表情與新第五表情對照](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/exp05-before-after.jpg)

## 七個 Motion：設計原則與自我查核

HeadX=0 是原始約 45°；-30 朝觀眾，+30 更偏側。參數值不是實際世界角度。時長／循環來自檔案，Console 和產品可另有播放政策。

| Motion | 時長 | 設計原則與合理界線 |
|---|---|---|
| Dormant／待機 | 12 秒循環 | 偏側、稍低頭，低幅度頭身往返與慢呼吸。維持清醒待機，不自行閉眼。 |
| Waking／甦醒 | 3 秒單次 | 從低頭偏側抬起，短暫朝觀眾，最後回 45°。表達注意到使用者。 |
| Listening／聆聽 | 8 秒循環 | 朝觀眾側停留較久，抬頭並緩慢調整傾斜。頭身 Z 同向；沒有向鏡頭前移。 |
| Thinking／思考 | 7 秒循環 | 維持另一端偏側、抬頭並緩慢調整頭身，靠面向和節奏區別聆聽。沒有獨立收肩造型。 |
| Speaking／說話 | 3.6 秒循環 | 較快的俯仰、側傾交替及身體擺動。喙部仍由 lip-sync 控制，不保證每次點頭與音節同步。 |
| Scene／姿態展示 | 10 秒循環 | 在觀眾側與偏側間作多段較大的姿態轉換。頭身有同向及反向區段。 |
| Suspending／收尾 | 3.2 秒單次 | 從觀眾側降低姿態、轉向偏側，最後回 45°。是收尾，不是停在睡眠姿態。 |

七個檔案本次未改；時長、範圍與節奏不同。內部仍有線性插值；首尾數值相接不代表速度完全連續，不宣稱自然表演已達最終品質。

## 五個 Expression 的定義

以下是獨立表情從 neutral 完整淡入的用途。表情包含眼部與姿態，不是五種經人類辨識測試通過的純臉部情緒。

| ID | 名稱 | 設計與自我查核 |
|---|---|---|
| exp_01 | 溫和專注 | 強笑眼、眼略收，抬頭傾頭。EyeSmile=1，不能描述成只有輕微收眼。 |
| exp_02 | 側頭探問 | 朝觀眾側偏轉並抬頭，搭配笑眼及同向頭身側傾。是探問，不是睜大眼驚訝。 |
| exp_03 | 低頭休息 | 明顯降低眼開度與頭身姿態。原 Add -0.7 會使眨眼較早進入閉眼範圍。 |
| exp_04 | 朝向警覺 | 朝觀眾側偏轉、下壓並傾斜。沒有 EyeOpen 項，不強制睜眼，也不是抬頭。 |
| exp_05 | 謹慎打量／保留態度 | 本次去掉附加笑眼，眼開度乘 0.85，保留偏側及頭身反向姿態。不稱為挑眉。 |

同姿勢候選比較支持「笑眼是 exp_01 與舊 exp_05 相似的主因」。最終 settled 圖和 Console 能看出新 exp_05 與 exp_01 的差別；這仍是 agent 判斷，使用者美感驗收尚未進行。

## 驗證與保存

- **備份**：修改前保存 v09 完整 ZIP、runtime ZIP 與逐檔 SHA；完整備份 ZIP 和原件 SHA 相同。另以 Cubism Save As 保全未存工作階段，保留未使用圖層來源。
- **Cubism Computer Use**：重新開啟 v10 內的 canonical v09 CMO，確認正常 45° 顯示，預覽眼開度後恢復 1。本次沒有改網格或重新輸出 MOC。`qa/editor-session-preserved.cmo3` 是另一份未存工作階段的保全檔，不應取代 canonical 模型。
- **格式**：本機 bundle validator 通過，17 runtime 檔、7 motion groups、5 expressions、EyeBlink/LipSync groups 可解析；這是 static 驗證。
- **真正 Core 渲染**：五表情各取 0、0.1、0.25、0.5、0.9、1、1.5 秒，共 35 幀。使用正確 SDK 時間差，不把尚未淡入完成的圖當成最終表情。
- **視線及眨眼**：HeadX=0/-30/+30 各九格 gaze，共 27 幀；各五段 blink，共 15 幀。blink 在 expression manager 之前寫入，核對實際乘算結果；不是最後覆寫眼開度來製造通過。
- **外觀保留**：neutral 和其他四表情的 settled 圖，所有 RGBA bytes 與 v09 相同。MOC、texture、model3 及其餘 runtime 檔 SHA 不變。
- **Console Computer Use**：原生檔案選擇器匯入，Load preview 正常顯示。逐一 Stop/reset 後預覽 exp_01／05，保存完整淡入畫面，最後停在正常 45°。managed library 17 檔與交付逐檔相符。
- **Skill／harness**：補入窄眼＋極端 gaze 矩陣、避免測試 setter 停止 expression manager、RGBA 比對不可只看 alpha 等規則。Skill validator 通過；修改快照及 QA 腳本附在完整包。

新 managed ID：`model-d5fef684-d4c0-4140-afdf-72f149076b95`；Console 顯示尾碼 `49076b95`。沒有發布 Appearance 草稿或切換主 Mirror。

證據：[35 幀時間矩陣](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/expression-captures/capture-matrix.json)、[42 幀 gaze/blink 記錄](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/exp05-combinations/combinations.json)、[眨眼對照](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/exp05-combinations/blink-comparison.jpg)、[Console 第五表情](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/console-v10-exp05.jpg)、[匯入逐檔驗證](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/console-import-verification.json)、[資產差異](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/qa/asset-change-manifest.json)。

## Coding Session：完整處理方式

**v10 沒有解決 motion＋完整 expression 的姿態夾限。** v09 已用 Core 證明 Thinking 單獨 HeadX=26/20/28，加 exp_05 後都變成 30；v10 未改 Head/Body 偏移，因此機制仍存在。涉及 `src/renderer/avatar/avatar-model-source.ts` 的 mapping 及 `src/renderer/avatar/cubism-avatar.ts` 的載入、setState、更新順序。承接 [v09 根因與完整驗收依據](C:/Project/magic-mirror/RAVEN-V09-MOTION-EXPRESSION-SELF-AUDIT.md)，請依當前程式整合：

1. 用模型明確設定選 state-expression mapping。Ren 保留自己的 mapping；Raven 另設。未知模型不因碰巧有 exp_01 就沿用 Ren，也不要綁死本機 import UUID。
2. 載入 Raven exp3 時建立兩個獨立 expression 物件：原始完整姿態供手動預覽；state 版本從原 JSON 衍生，只保留四個 EyeOpen/EyeSmile 項。保留 Value、Blend、fade，不改磁碟原檔或暫時修改共用物件。
3. state 採衍生物件，Head/Body/Breath 交回 motion 與既有 effects。Raven 配對可維持 Dormant/Suspending→03，Waking/Listening/Speaking→01，Thinking→05，Scene→02。手動完整表情先 reset 再啟動原始物件。
4. **v10 EyeOpen 要保留 Multiply 0.85**，不能變成 Add 0.85 或 Overwrite 0.85。底層 blink 先算，表情後算；完整淡入後 blink=0 應仍得到 0。
5. 暫時無法建立 state 專用物件時，讓 Raven 自動 expression 為 null，保留手動預覽。不要縮小所有 motion，也不要每幀 auto-fit。
6. 未來追蹤另定 Head/gaze 與 motion 的混合、平滑政策；本修法不代表完成追蹤整合。

```ts
const faceIds = new Set([
  'ParamEyeLOpen', 'ParamEyeROpen',
  'ParamEyeLSmile', 'ParamEyeRSmile',
])
const stateExpressionJson = {
  ...rawExpressionJson,
  Parameters: rawExpressionJson.Parameters
    .filter(p => faceIds.has(p.Id))
    .map(p => ({ ...p })),
}
// 原始／衍生 JSON 各自 loadExpression，放入獨立 Map。
// state 查模型 mapping + state Map；手動完整預覽查原始 Map。
```

最小驗收：衍生 JSON 不寫 Head/Body/Breath/gaze/mouth，原始 JSON 不變；未知模型不自動套 Ren；Thinking＋state exp_05 在相同時刻保留原 HeadX 變化，Listening/Scene 亦與各自 baseline 對照；完整淡入後 blink=1/.5/0 得 .85/.425/0；手動表情和 Stop/reset 仍可用。沿用既有 SDK，不必因本次修訂換依賴。

## 構圖與限制

v09 的 `Layout={height:1.9,x:0.17,y:-0.05}`、+30 頭部 keyform、喙尖邊界修正均保留。本次不需改構圖 code。v07 到 v09 的判斷與既有 +30 Console／579 個抽樣證據，見 [v09 構圖及喙部文件](C:/Project/magic-mirror/RAVEN-V09-BEAK-FIX-AND-MOTION-DESIGN.md)；這些是沿用 v09 證據，不是 v10 全部重跑。

部分極端斜向 gaze 仍遮住虹膜，尤其偏側眼型；0.85 比退回的 0.65 候選保留更多瞳孔，但不能宣稱「所有極值瞳孔皆完整清楚」已通過。後側羽毛／肩部的極端邊緣裁切亦是既有界線。camera tracking、語音整合、產品 regression 及使用者美感驗收未做。

## 使用、編輯與回復

- [v10 model3](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/runtime/raven-lord.model3.json)：保留整個 runtime 目錄。
- [v10 runtime ZIP](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10-runtime.zip)：解壓後在 Console 選 model3 匯入。
- [v10 完整可編輯包](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10-complete.zip)：含 runtime、canonical CMO、四份 PSD／來源圖、QA、文件、本次 Skill 改進快照。
- [canonical CMO](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/cubism/raven-lord-v09.cmo3)：保留 v09 名稱，因 rig 未改；v10 表情在可編輯 exp3 JSON。不要用 editor-session-preserved.cmo3 取代。
- [保留版本與回復入口](C:/Project/magic-mirror/RAVEN-AVATAR-VERSIONS.md)：可回到 v7 或 v8。v09 備份已依後續清理要求移除，原逐檔清單保留在歷史 QA 中。

`qa/*-065-candidate*` 和 eye-design-candidates 是候選實驗，並非最終值。最終以 runtime/exp_05 及不帶 candidate 後綴的表情／組合資料為準。ZIP 內 Markdown 連結指向本機工作位置；移到其他電腦時，資產可用，證據連結需調整。
