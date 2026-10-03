# Avatar 顯示比例修正：交給 Magic Mirror coding session

日期：2026-09-08。狀態：**唯讀診斷與實作交接；產品修正尚未實施、尚未驗收。**

使用者要修正渡鴉大人 v08 在 Console 中比 v07 明顯縮小的問題。建議保留 v08 的 PSD、CMO3、MOC3、1280×1672 製作畫布與全部動作，修正 Magic Mirror 的模型構圖策略。這份文件可作為實作依據；執行前仍應核對當前程式與 [AGENTS.md](C:/Project/magic-mirror/AGENTS.md)，保留另一個 session 的變更。

## 1. 要達成的結果與範圍

- 在相同 9:16 構圖、neutral 參數和相同視窗下，v08 的人物尺度回到 v07 的基準；v08 新增左右畫布留白不再使人物縮小。
- 保持人物等比例；HeadX=-30 仍朝觀眾，HeadX=0 仍為原本約 45°，不改參數、網格或動作幅度。
- `model3.json` 的既有 `Layout` 能持續生效，不被每幀繪製或視窗 resize 覆蓋。
- Console 與主 Mirror 共用相同構圖規則。主 Mirror 的發布／切換依產品 session 當前授權及草稿狀態處理；本文件不授權發布既有未完成草稿。
- 本次不需要新增 zoom UI、改 catalog/config schema、升級 Cubism、改 CSS 版面、改 voice/camera/physics，或重匯出 Avatar。

「填滿」指人物在既有 9:16 顯示區內恢復合理占比，不是把人物拉伸到 Console 的側欄或把原本透明背景塗滿。非 9:16 螢幕的 letterbox 是目前既定行為。

## 2. 已確認的原因

### 真實 MOC 的 Core metadata

以下由專案既有 Core 6.0.1 分別載入兩個實際 MOC 取得；不是從檔名推測。

| 欄位 | v07 | v08 |
|---|---:|---:|
| CanvasWidth | 941 | 1280 |
| CanvasHeight | 1672 | 1672 |
| CanvasOriginX | 470.5 | 640 |
| CanvasOriginY | 836 | 836 |
| PixelsPerUnit | 941 | 941 |
| `getCanvasWidth()` | 1 | 1.3602550478 |
| `getCanvasHeight()` | 1.7768331562 | 1.7768331562 |
| `model3.json` Layout | 無 | 無 |

兩版 neutral 下非零 opacity drawable 的頂點聯集約為 `[-0.53138375, -0.91456980, 0.5291781, 0.69078833]`，幾乎相同。這支持「主要人物幾何沒有跟著畫布加寬」；此頂點聯集含透明紋理區與遮罩相關幾何，**不能當成實際可見 alpha 輪廓或美感相似度**。

### 目前的程式鏈

1. [portrait-layout.ts](C:/Project/magic-mirror/src/renderer/avatar/portrait-layout.ts:1) 固定 1080×1920，使用 `min(viewportWidth/1080, viewportHeight/1920)` 等比例適配外部視窗。
2. [AvatarCanvas.tsx](C:/Project/magic-mirror/src/renderer/avatar/AvatarCanvas.tsx:21) 根據 host／window 尺寸及 DPR 設定實際 WebGL canvas。這一層本次應保留。
3. [cubism-avatar.ts 的 load](C:/Project/magic-mirror/src/renderer/avatar/cubism-avatar.ts:162) 載入模型並執行 `getLayoutMap()`、`setupFromLayout()`。
4. [CubismModelMatrix](C:/Project/magic-mirror/src/vendor/live2d/Framework/dist/math/cubismmodelmatrix.js:20) 的 constructor 已先執行 `setHeight(2.0)`。`setWidth/setHeight` 會寫入縮放值，不是相對累乘。
5. [cubism-avatar.ts 的 draw](C:/Project/magic-mirror/src/renderer/avatar/cubism-avatar.ts:457) 現在含有：

```ts
if (this._model.getCanvasWidth() > 1 && width < height) {
  this._modelMatrix.setWidth(2)
  projection.scale(1, width / height)
} else {
  projection.scale(height / width, 1)
}
```

v07 的寬度恰好為 1，**不符合 `> 1`**，沿用初始化的高度基準。v08 符合條件，每幀被改成寬度基準。

在精確 9:16 畫面，舊程式的 v08／v07 人物線性尺度比為：

```text
(1080 / 1280) / (1920 / 1672)
= 1672 × 9 / (1280 × 16)
= 0.734765625
```

因此寬高約剩 73.5%，不是 Avatar 解碼缺件。實際小尺寸 canvas 有像素取整，比例可能有極小差異。

這個條件也造成單位敏感性：相同實體畫布和美術，只調整等價輸出的 PPU，使 widthUnits 從 1 變成 1.001，就可能切換構圖並突然縮小。另外，在該分支下，載入時設定的 Layout width/height 也會被覆蓋；依原縮放算出的 center/edge 位置可能不再與新縮放一致。

## 3. Cubism 做法與本專案的選擇

Cubism 將模型座標／Layout 與畫面投影分開。`CubismModelMatrix` 依模型畫布尺寸初始化，可用 `setHeight/setWidth` 設定大小，再用 `setupFromLayout` 套用 model3 中的構圖資訊。[官方 Layout 文件](https://docs.live2d.com/en/cubism-sdk-manual/layout/)

上述 `> 1` 條件也存在於 [官方 Web demo manager](https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/TypeScript/Demo/src/lapplive2dmanager.ts)。它是 demo 的適配策略，不能當作所有半身 Avatar 的通用 framing 契約。這裡應針對 Magic Mirror 固定 9:16 的產品構圖調整，不修改 vendor Framework。

本次選擇：**預設以模型畫布高度為基準，尊重明確 Layout，繪製期間不改模型矩陣。**

- 保留 1280×1672 authoring canvas、PPU、origin 與 rig。修改 Editor 畫布或 export units 只為避開現有分支，無法解決下一個不同模型的同類問題。這些欄位有正式的模型座標意義。[官方匯出設定](https://docs.live2d.com/en/cubism-editor-manual/export-moc3-motion3-files/)
- 高度基準是 Magic Mirror 的預設產品策略，不代表任意模型都能不經美術校準自動得到最佳裁切。將來若上下留白很多或想改半身構圖，使用該模型固定的 Layout 調整；必要時才另外設計 app view/camera 功能。
- 不把所有 Avatar 硬乘 `1.36`，不依 model ID 寫特例，不用 CSS transform 放大 canvas。
- 不每幀依 alpha／drawable bounds 自動填滿；那會使轉頭、眨眼、張嘴或 physics 改變輪廓時觸發整體縮放／位移。可見範圍可用於離線構圖校準及 QA，最後的顯示構圖應固定。

## 4. 具體修改方式

### 4.1 保留載入流程

保留現有 `loadModel()` 後的 Layout 設定。新的 `CubismModelMatrix` 本身已有 `setHeight(2)` 預設值，無須在 draw 裡再次設定：

```ts
const layout = new Map<string, number>()
setting.getLayoutMap(layout)
this._modelMatrix.setupFromLayout(layout)
```

無 Layout 時沿用預設高度 2；有 Layout 時由 Layout 明確指定。不要在 Layout 套用之後又無條件 `setHeight(2)`，那會重新破壞 Layout。

### 4.2 將投影計算抽成小型純計算函式

建議新增 `C:\Project\magic-mirror\src\renderer\avatar\avatar-framing.ts`，讓測試可驗證正式程式使用的數學，無須啟動 Electron、Core 或 WebGL。以下是可採用的實作草案，需依實作時的本地型別核對：

```ts
import { CubismMatrix44 } from '../../vendor/live2d/Framework/dist/math/cubismmatrix44'

// width/height come from the existing validated portrait layout.
// Preserve the model's initialized scale and authored Layout.
export function createAvatarMvp(
  width: number,
  height: number,
  modelMatrix: CubismMatrix44,
): CubismMatrix44 {
  const projection = new CubismMatrix44()
  projection.scale(height / width, 1)
  projection.multiplyByMatrix(modelMatrix)
  return projection
}
```

輸入為既有有效、正值的實際 canvas pixel 尺寸；現有 portrait layout 的無效尺寸處理應保留。這不是新增一個接受任意外部輸入的 API。

函式每次建立新的 projection，保留目前已使用的 `multiplyByMatrix` 呼叫順序，不修改傳入的 modelMatrix，也不修改 vendor 的矩陣實作。

### 4.3 替換 draw 中的分支

在 `cubism-avatar.ts` 匯入上述函式，將現有建立 projection、`> 1` 分支和矩陣合成那一段替換成：

```ts
const projection = createAvatarMvp(
  this.#canvas.width,
  this.#canvas.height,
  this._modelMatrix,
)
this.getRenderer().setMvpMatrix(projection)
```

保留其後的 framebuffer／viewport、`drawModel()`、renderer lifecycle 和錯誤處理。若原來的 `CubismMatrix44` import 已無其他用途，再移除該 unused import。

預期產品 diff 主要限於此函式、draw 呼叫與回歸測試。`portrait-layout.ts`、`AvatarCanvas.tsx`、CSS 和 avatar profile schema 本次不需修改。

### 4.4 重建模型實例再驗證

舊程式已經改過執行中 `_modelMatrix` 的縮放。套用程式後，用產品既有的模型載入／renderer dispose-create 流程建立新的實例，確保從 constructor／Layout 初始化。不要只移除 draw 裡的 setter，卻沿用舊實例殘留的 width-fit 值來判定修正效果。

使用目前 canonical app，依 coding session 的正常更新方式操作；保留未保存草稿，不啟動第二套 Electron。

## 5. 程式回歸測試

建議新增 `C:\Project\magic-mirror\tests\renderer\avatar\avatar-framing.test.ts`。使用專案現有 `CubismModelMatrix`／`CubismMatrix44` 和正式的 `createAvatarMvp()`；不能只檢查原始碼是否包含字串，或在 test 內重寫一份算法自我驗證。

| 測試 | 輸入與預期 |
|---|---|
| v07／v08 基準一致 | 建立 `(941/941,1672/941)` 與 `(1280/941,1672/941)` 的 model matrices，無 Layout；同一 1080×1920 stage 下 MVP 應近似相等。寬度 padding 不再改變人物尺度。 |
| PPU／widthUnits 門檻 | 同一 1280×1672 物理畫布，令 PPU=`1280/widthUnits`，widthUnits 分別 0.999、1、1.001、1280/941；同一實體頂點 `(200/PPU,100/PPU)` 經對應模型矩陣與 MVP 轉換後位置相等。比較等價頂點結果，不是要求不同 PPU 的原始矩陣數值相等。 |
| Layout 不被覆蓋 | 套用固定 `height`、`x`、`y` 的 Layout 後，連續建 MVP 及 resize，modelMatrix 的 16 個元素保持原值，輸出維持對應大小和位移。另覆蓋一個明確 `width` Layout 案例。 |
| 不累積縮放 | 用同一 modelMatrix 連續計算至少 100 次，相同尺寸所得 MVP 不漂移，modelMatrix 不被 mutation。 |
| 解析度與 DPR | 540×960、1080×1920、2160×3840 的相對構圖一致；等長的水平／垂直模型位移換算為畫面 pixels 後等長，角色不被拉伸。小尺寸取整允許對應浮點誤差。 |

PPU 測試只建立等價的計算 fixture，不修改、偽造或重寫 `.moc3`。模型真正渲染與裁切仍在下一節驗證。

預期 focused commands（於 canonical project，執行前核對當前 scripts）：

```powershell
npx vitest run tests/renderer/avatar/avatar-framing.test.ts tests/renderer/avatar/portrait-layout.test.ts
npm run typecheck:web
```

先建立能暴露舊分支問題的回歸案例，再驗證修正。無需為這個幾行構圖修改自動啟動整套產品 QA、麥克風測試或完整 `npm test`；依當前 AGENTS 決定必要的其他檢查。上述命令在本交接階段**尚未執行**。

## 6. 真正模型的畫面驗收

建議將本次新證據另存 `C:\Project\magic-mirror\artifacts\avatar-framing-qa\`，或依產品當前 runbook 使用既有 evidence 目錄。不得覆蓋 v08 原交付的 QA 或 ZIP；那些只證明修正前版本。

### 固定條件

- 同一個 9:16 canvas 尺寸、DPR、背景、neutral 參數及停止中的 motion；不可拿兩個不同大小的 Console 視窗直接比較。
- v07／v08 均從新建立的模型實例開始。記錄 model3／MOC hash、實際 canvas pixel 尺寸、模型 canvas／PPU、使用的 Layout。
- 像素占比以真實渲染的 alpha 輪廓為輔助，記錄 alpha threshold；遮罩幾何、透明 ArtMesh bbox 不能當作可見人物外框。

### 必看結果

1. v07 與 v08 neutral 並排：相同高度與 PPU 下的矩陣基準一致；共同西裝／配件的畫面尺寸恢復可比較狀態。v08 頭部美術有改動，不要求整張 PNG 逐像素相等。
2. v08 HeadX=-30/0/+30、HeadY/Z 兩端、BodyX/Y/Z 兩端，以及 HeadXY 九格，確認放大後頭頂、眼、喙和重要胸前配件沒有新增的非預期裁切。既有半身底部出畫屬構圖，可保留並記錄。
3. 正面／側面最大張喙、眨眼／笑眼、視線九格仍正常；嘴洞在 checker／白底仍透明。
4. 七組 motions 和五 expressions 取代表時段，確認不因輪廓變化而整體自動縮放或平移；現有 motion 自己的頭身動作應保留。
5. Console 預覽 resize 後構圖相同。用現有受控方式核對主 Mirror 共用相同 renderer；若未授權切換／發布，就如實保留「Console 通過、主 Mirror 新顯示未測」，不發布草稿湊驗收。
6. 用現有 builtin Ren，以及已保留的官方 Haru 在隔離 preview/harness 比較新舊顯示。若其他人物需要不同裁切，先記錄該人物的明確 Layout 需求，不能重新加回全域 `> 1` 特例。沒有對應畫面證據前，不聲稱所有 Avatar 已回歸通過。

只固定整個畫布高度不會自動保證所有人物都貼合邊緣；最終需要依實際姿態決定安全留白。若 v08 在 v07 基準下有裁切，可對 v08 設定經驗證的固定 Layout，保留合理動作空間；記錄設定與占比，不偷偷改小 motions。

## 7. Avatar skill／harness 同步工作

目前獨立 harness 的 `draw()` 也沿用了相同 `> 1` 分支。舊 harness 與產品畫面一致，**不能證明相對 v07 的構圖正確**；本次正是漏了這個回歸維度。

相關檔案：

- [已安裝 harness draw](C:/Users/b8901/.codex/skills/magic-mirror-avatar-studio/scripts/runtime-qa/src/cubism-qa.js)
- [harness 說明](C:/Users/b8901/.codex/skills/magic-mirror-avatar-studio/references/runtime-qa-harness.md)
- [感知 QA 規則](C:/Users/b8901/.codex/skills/magic-mirror-avatar-studio/references/perceptual-qa.md)

這部分由 Avatar／skill 維護 session 同步；若 coding session 的授權包含維護該 skill，也可一併完成。產品修正不需要新增對外部個人 skill 路徑的 runtime 依賴。

同步時應：

- 讓 QA 使用產品相同的 height＋Layout 構圖契約，記錄 framing mode 和實際 canvas 尺寸；保留舊 evidence，不讓新程式覆寫舊報告。
- 新增「同版本畫布留白變更」「等價 PPU 變更」「v07／v08 共同身體比例」「Layout 在多幀／resize 後持續生效」的預期不變條件。
- 區分診斷用 1280×1672 canvas 與產品 9:16 canvas；美術畫布尺寸相同不等於產品構圖相同。最終產品占比 QA 必須有真正 9:16 render。
- 每次 Avatar 交付記錄來源 canvas、MOC canvas／origin／PPU、模型 Layout，以及預定 9:16 顯示下的人物占比。
- 不以新舊程式都能載入、PNG 有像素、或 contact sheet 的各自縮放版來代替占比回歸。

## 8. 可直接使用的 Avatar 與回復資料

| 用途 | 路徑 |
|---|---|
| v07 manifest | [raven-lord.model3.json](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord/runtime/raven-lord.model3.json) |
| v08 manifest | [raven-lord.model3.json](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v08/runtime/raven-lord.model3.json) |
| v08 source 與控制說明 | [README.md](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v08/README.md) |
| v08 檔案 hashes | [final-files.json](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v08/qa/final-files.json) |
| v08 舊 QA | [QA-REPORT.md](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v08/qa/QA-REPORT.md) |
| v07 完整備份 | [rollback-v07.zip](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-backups/v07-before-motion-rework-20260908T052023Z/rollback-v07.zip) |
| 官方 Haru reference | [Haru.model3.json](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/avatar-import-display/official-reference/Haru/Haru.model3.json) |
| 原 Avatar 交接 | [RAVEN-AVATAR-HANDOFF.md](C:/Project/magic-mirror/RAVEN-AVATAR-HANDOFF.md) |

v08 MOC SHA-256：`8b96dd720f221bd47bf7a51ec0e5efce7de3301c6a996d13aa9c07e4338d3918`。

v08 曾正常匯入的 managed ID：`model-9c968fa4-5e14-4fb5-b2af-fad0c4d3cf1b`。v07：`model-93ccc318-06ff-417f-a301-557ae7eaac2d`。它們是先前確認的匯入紀錄，不代表當前選取／發布狀態；應由正常 UI 確认，不直接編輯 managed asset 副本。

產品程式回復由 coding session 保留本次局部 diff 並撤回自己的修改；不要 reset 其他 session 的工作。這個修正預期不改 Avatar runtime bytes，所以 v07／v08 資產備份仍可原樣使用。

## 9. 完成回報應包含

- 實際修改的檔案與 focused test／typecheck 結果。
- 修正前後相同 9:16 尺寸的 v07／v08 neutral 對照，以及動作極值裁切結果。
- Layout、PPU 等價輸出及 resize 不變性檢查結果。
- builtin Ren／Haru 的實際檢查範圍與剩餘構圖問題。
- 顯示驗證發生在 Console 或主 Mirror；是否有發布動作必須如實分開寫。
- skill／harness 是否已同步，或明確交回 Avatar session 的剩餘工作。

此文件中的程式片段與測試是待執行方案，不能當成已完成修正或已通過產品驗收的證據。
