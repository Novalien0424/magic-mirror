# 魔鏡 AI Avatar 製作路線調查（2D_Avatar_Fable_Suvey）

**日期：** 2026-09-06
**作者：** Claude Fable 5.1（研究與整理），主持人提問
**狀態：** 調查報告，未做任何產品決策；不改變 PRD §6「Live2D rig」決策，若採用 A／B 路線需新增 ADR。
**範圍：** 主持人提供一張 AI 生成的 2D 角色圖，其餘建模與動畫由工具鏈自動產出；只接受一次性付費，不接受月費；必須在 Mac mini M4 本地即時渲染，嘴型只能由實際輸出音訊驅動。

---

## 1. 問題與結論

**問題一：** HeyGen 等商業「免分層、免 rig」的即時 Avatar 用什麼技術？能否用免費開源方案在本專案達到同樣簡便？

**結論：** 它們全部是雲端 GPU 神經影片生成加 WebRTC 串流，按分鐘計費，角色創建在伺服器端訓練。在 Mac mini M4 上「單張圖、本地、免費、即時」的開源等價物目前不存在；同類開源模型的即時推論都需要 NVIDIA CUDA／TensorRT。

**問題二：** VRoid Studio 是否仍是最佳路線？

**結論：** 不是。VRoid 只能用滑桿捏角色，不吃圖片輸入，違反「由我的圖產出」這個前提。

**推薦順序：**

1. **A. LAM（阿里巴巴）** — 一張圖 → 可動 3D Gaussian 頭像，免費，瀏覽器 WebGL 即時渲染。先用零成本驗證。
2. **C. 一次付費委託 Live2D rigger** — 零程式碼改動，品質天花板最高，最貼 PRD 原決策。
3. **B. Reallusion CC5 + Headshot 3** — 一次性 US$498，圖 → 全身 3D 角色含臉部 blendshapes，寫實取向。

---

## 2. 商業產品的 tech stack（查證 2026-09-06）

| 產品 | 渲染方式 | 自製角色 | 本地／免費 | 與本專案的相容性 |
|---|---|---|---|---|
| HeyGen LiveAvatar | 雲端神經影片生成，LiveKit WebRTC 串流；LITE 模式自帶 LLM／TTS | 一張照片或 2 分鐘影片，伺服器端訓練 | 否，LITE 約 US$0.10／分鐘 | 吃文字再自行 TTS，會變成兩套聲音 |
| Tavus Phoenix-4 | Gaussian + diffusion 混合模型，雲端 | 影片 | 否 | 同上 |
| Anam Cara-4 | 即時 diffusion 逐像素生成，雲端 | 一張圖，可含動漫／3D 角色 | 否 | 同上 |
| Simli | Gaussian 模型，雲端；直接吃 16 kHz PCM 音訊 | 照片或預設 | 否，免費額度 US$10 加每月 50 分鐘 | 唯一與「audio is the clock」相容者 |
| D-ID | 雲端 | 照片 | 否 | 同 HeyGen |

與本專案架構的三個衝突：

- Tech Spec §18 第 11 條：雲端失效走 OfflineLoop。多一個雲端 Avatar 等於多一個必然發生的失效來源。
- Realtime 輸出是音訊不是文字。多數服務的 bring-your-own 模式吃文字再自行 TTS，只有 Simli 直接吃 PCM。
- 音訊送出再等影片回來，Tech Spec §15「AI audio 開始 → mouth motion 開始 P95 ≤ 80 ms」達不到。

---

## 3. 開源即時 talking head 在 M4 上的可行性

| 專案 | 授權 | 即時需求 | Apple Silicon | 自製角色 | 判定 |
|---|---|---|---|---|---|
| MuseTalk | 開源 | NVIDIA V100 30 fps+ | 有 MPS 支援但無人宣稱即時 | 需一段真人影片 | 不即時 |
| Ditto（antgroup） | 開源 | CUDA + TensorRT | 無 | 一張圖 | 不可行 |
| LivePortrait | 開源 | RTX 4090 12.8 ms／幀 | 官方 issue：慢約 20 倍 | 一張圖 | 不即時 |
| LiteAvatar（HumanAIGC） | MIT | CPU 30 fps | 只寫 Windows／Linux | 只有 ModelScope 圖庫，無自製工具，只支援中文 | 不可行 |
| OpenAvatarChat | Apache-2.0，v0.6.0（2026-04） | 依後端 | LAM 模式為客戶端渲染，最輕 | 依後端 | 僅 LAM 模式值得看 |
| Talking Head Anime 4 | 開源 | 消費級 NVIDIA GPU，需為每個角色蒸餾小模型 | 無 | 一張動漫圖 | 不可行 |

---

## 4. 三條可行路線

### 4.1 A. LAM（Large Avatar Model，阿里巴巴 aigc3d）

- **論文：** SIGGRAPH 2025，arXiv 2502.17796。一張肖像圖經單次前向即得可動 Gaussian 頭像；重建 1.4 秒；A100 562.9 FPS；小米 14 手機 110+ FPS。
- **輸入：** 論文明述支援文生圖產生的圖片與風格化輸入，AI 半寫實圖片屬目標用例。實際效果需自行驗證。
- **產出：** 頭部到肩部。魔鏡裡浮現一張臉貼題。
- **授權與維護：** 主 repo Apache-2.0，1050 stars，最後推送 2026-06-10；2026-04-30 另發表 MeshLAM（CVPR 2026）。
- **生成：** 需 CUDA，但官方 Hugging Face Space（3DAIGC/LAM）與 ModelScope 提供免 GPU 生成，可下載 ZIP。自架則一次性租 GPU 數小時即可。
- **渲染：** `LAM_WebRender`，MIT，npm 套件 `gaussian-splat-renderer-for-lam`，最新 0.0.9-alpha.2（2026-04-02），依賴 three ^0.173。API：`GaussianSplatRenderer.getInstance(div, assetZipPath)`；每幀輸入 ARKit 52 blendshape 係數（JSON 範例 `test_expression_1s.json`）。
- **音訊驅動：** 官方 `LAM_Audio2Expression`（Apache-2.0，Wav2Vec 編碼，最後推送 2025-10-24）需 CUDA，Mac mini 跑不了。替代方案：瀏覽器內從實際輸出音訊算 viseme（TalkingHead 的 HeadAudio AudioWorklet，或 wawa-lipsync），映射成 ARKit jawOpen／mouth 係數。與現有 analyser tap 架構相容，不需文字或時間戳。
- **需自行實作：** 眨眼、呼吸、微頭動的係數曲線（現有 Cubism 版邏輯可移植）；七個狀態的動作對應；Main 端 bundle 驗證的 LAM 版本；Console 匯入。
- **風險：** 渲染套件仍是 alpha；頭部以下無身體；Electron 內 WebGL 效能未實測。

### 4.2 B. Reallusion Character Creator 5 + Headshot 3

- **費用：** CC5 永久授權 US$299，Headshot 3 永久授權 US$199。官方論壇確認「從 2D 照片產生 3D 頭」與「從 mesh 產生」不耗點數；只有 AI 生圖與增強（Nano Banana Pro）按點計費。
- **時程：** CC5 於 2025-08 發布；Headshot 3 於 2026-04-28 發布，3.1 於 2026-07。
- **平台：** Windows 軟體，與本專案開發機相同。
- **產出：** 全身骨架 rig 加 blendshape 臉部 rig，匯出 FBX／OBJ；用 Blender 轉 GLB 後交給 TalkingHead 渲染。
- **渲染：** TalkingHead（met4citizen）MIT，v1.7，three.js 0.180，ES module；HeadAudio 從音訊即時算 viseme；官方附 OpenAI Realtime WebRTC 範例頁。需 ARKit 52 blendshapes 加 Oculus 15 visemes；若匯出缺少，可用開源 `arkit-blendshape-tool` 轉移。
- **風險：** 圖轉 3D 為寫實取向，動漫感強的圖會失真；多一步 Blender；需新 renderer adapter。

### 4.3 C. 一次付費委託 Live2D rigger

- **費用：** 一次性，市場行情依複雜度約數百到一千多美元。
- **產出：** 直接依本專案 contract 交付：`.moc3`、`.model3.json`（含 EyeBlink／LipSync groups、七組 motion groups）、材質、`.physics3.json`、`.motion3.json`、`.exp3.json`。
- **程式碼改動：** 零。Console → Avatar / Audio → Appearance → Browse & import Cubism 即可載入。
- **授權：** rigger 使用自己的 Cubism 授權；本專案維持 FREE。Cubism PRO 無永久授權，只有訂閱。
- **風險：** 等待 2 到 6 週；後續修改需再委託。

---

## 5. 排除的選項與原因

| 選項 | 原因 |
|---|---|
| VRoid Studio | 不吃圖片，只能滑桿重捏；風格偏動漫 |
| CartoonAlive（Human3DAIGC，2025-07） | 「單張肖像 → Live2D」正是所需，但 repo 只有 README、assets 與影片，無程式碼；2025-07-24 後無更新；32 stars |
| Textoon（Human3DAIGC） | 有程式碼，但只吃文字（SDXL + ControlNet），套用 Live2D 模板 `female_01Arkit_6`，受 Live2D Free Material License 約束；最後推送 2025-07-02 |
| Hunyuan3D／TRELLIS／Tripo／Meshy／Rodin | 圖轉 3D 網格，臉部無可用 blendshape；Tripo／Meshy 為訂閱或月點數制 |
| Ready Player Me | 2026-01-31 已關閉 |
| Avaturn | 照片 → 寫實 GLB 含 ARKit 與 visemes，非商用免費；可作 B 的免費替代，但客製度低 |
| MPFB（Blender） | CC0 寫實人體，但不吃圖，需 Blender 技能 |
| Mixamo | 仍免費可用但無維護，且無臉部 blendshape |
| Faceit（Blender 外掛） | 一次性付費可為任何頭產 ARKit 52，只在 B 路線需要補 blendshape 時才有用 |
| Simli 等雲端 | 月費／分鐘計費，違反一次性付費前提 |

---

## 6. 對現有實作的影響

程式碼中的可替換接縫已存在（Tech Spec §4 原則 7）：

- `src/renderer/avatar/cubism-avatar.ts` 的 `CubismAvatarRenderer` 介面只有：`initialize`、`setState`、`playMotion`、`setExpression`、`setMouthOpen`、`stopSpeakingMotion`、`clearExpression`、`resize`、`dispose`。
- `src/renderer/avatar/audio/lip-sync-driver.ts` 每幀輸出 0 到 1 的 RMS 值，不綁 Cubism。A／B 路線改為輸出 viseme 或 ARKit 係數即可。
- `src/renderer/avatar/AvatarCanvas.tsx` 掛載 renderer，已處理非同步載入與 dispose。
- `src/main/avatar/model-bundle.ts` 與 `model-import.ts` 是 Cubism 專用驗證，需新增 LAM ZIP 或 GLB 的變體。
- Console Appearance 匯入流程需增加格式選擇。

工作量估計：A 或 B 約與 Phase 3 同量級（數天）；C 為零。任一 3D 路線都需新增 ADR 記錄 PRD §6「Live2D rig」決策的變更；不牴觸 Tech Spec §18 的 11 條固定決策。

---

## 7. 建議的下一步

1. **零成本驗證 A（約 10 分鐘）：** 將 AI 生成圖上傳到 Hugging Face Space `3DAIGC/LAM`，下載 ZIP，clone `LAM_WebRender` 執行 `npm install && npm run dev`，替換 `asset/arkit/*.zip`，在本機看像不像、風格能否接受。
2. 若 A 可接受：撰寫 ADR 與工作單，實作 LAM renderer adapter、瀏覽器內 viseme → ARKit 映射、眨眼／呼吸曲線、Main 驗證與 Console 匯入。
3. 若要穩定交付、不承擔 alpha 風險：走 C，將第 4.3 節的 contract 直接交給 rigger。
4. 若要寫實全身加手勢：走 B。

---

## 8. 附錄：Cubism 手動路線的最低需求（供 C 路線交付或自製）

- Cubism Editor 5.3.00（2026-04-23）為穩定版；FREE 限制：1 張 ≤2048 px 材質、100 ArtMesh、50 deformer、30 parts、3 blend shape 參數。
- PSD：RGB、一層一部件、線稿與填色合併、唯一圖層名、被遮蔽區域須補畫。
- 參數：`ParamAngleX/Y/Z`、`ParamEyeLOpen/ROpen`（勾 Blink）、`ParamMouthOpenY`（勾 LipSync，0 到 1 全程可看）、`ParamMouthForm`、`ParamBodyAngleX`、`ParamBreath`。
- Motion groups：Dormant、Waking、Listening、Thinking、Speaking、Scene、Suspending；同一檔案可重複使用；motion 曲線不得含嘴型與眨眼參數。
- 匯入失敗代碼：`avatar_eye_blink_group_missing`、`avatar_lip_sync_group_missing`、`avatar_motion_group_missing`、`avatar_asset_missing`、`avatar_asset_path_invalid`。

---

## 9. 來源

- LAM：https://github.com/aigc3d/LAM ；論文 https://arxiv.org/abs/2502.17796
- LAM_WebRender：https://github.com/aigc3d/LAM_WebRender ；npm `gaussian-splat-renderer-for-lam`
- LAM_Audio2Expression：https://github.com/aigc3d/LAM_Audio2Expression
- OpenAvatarChat：https://github.com/HumanAIGC-Engineering/OpenAvatarChat
- CartoonAlive：https://github.com/Human3DAIGC/CartoonAlive ；論文 https://arxiv.org/abs/2507.17327
- Textoon：https://github.com/Human3DAIGC/Textoon
- Reallusion Headshot 3 定價討論：https://discussions.reallusion.com/t/important-headshot-3s-ai-features-pricing/17053
- Reallusion Headshot 3 商店：https://www.reallusion.com/plan-and-pricing/individual/perpetual/headshot-3-plugin-3098
- CC5 發布：https://www.cgchannel.com/2025/08/reallusion-releases-character-creator-5/
- Headshot 3.1：https://www.cgchannel.com/2026/07/reallusion-releases-headshot-3-0/
- TalkingHead：https://github.com/met4citizen/TalkingHead
- wawa-lipsync：https://github.com/wass08/wawa-lipsync/
- AIRI：https://github.com/moeru-ai/airi
- HeyGen LiveAvatar：https://help.heygen.com/en/articles/12758516-introducing-liveavatar ；定價 https://realtimeavatar.ai/blog/heygen-api-pricing-explained
- Tavus Phoenix-4：https://www.businesswire.com/news/home/20260218278213/en
- Anam Cara-4：https://anam.ai/blog/meet-our-most-expressive-model-yet-cara-4
- Simli：https://docs.simli.com/api-reference/simli-webrtc
- MuseTalk：https://github.com/TMElyralab/MuseTalk
- Ditto：https://github.com/antgroup/ditto-talkinghead
- LivePortrait Apple Silicon：https://github.com/KwaiVGI/LivePortrait/issues/65
- LiteAvatar：https://github.com/HumanAIGC/lite-avatar
- Talking Head Anime 4：https://pkhungurn.github.io/talking-head-anime-4/
- Ready Player Me 關閉：https://avatarsdk.com/blog/2026/01/15/switch-from-ready-player-me-to-avatar-sdk-fast-familiar-production-ready/
- VRoid Studio：https://vroid.com/en/studio
- Avaturn：https://avaturn.me/
- Cubism 授權：https://help.live2d.com/en/license/license_01/ ；FREE／PRO 比較 https://www.live2d.com/en/cubism/comparison/
