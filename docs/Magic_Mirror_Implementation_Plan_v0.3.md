# 魔鏡 AI Avatar：Phase Implementation Plan

**版本：** 0.3.1  
**日期：** 2026-08-16  
**狀態：** Build-ready  
**對應文件：** `Magic_Mirror_PRD_v0.3.md`、`Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`  
**目的：** 把 Phase 1 Prototype 拆成 Phase 0～7；每一階段都能在 Mac mini 上獨立執行、展示、診斷與驗收。

> **v0.3.1（2026-08-16）修訂：** 依 stack adversarial review 在 Phase 0／1／2／3／5／6 加入版本 pin、TCC 打包基線、Voice contract test 追加項、wake telemetry 校正、RMS-first lip sync 基線、embedding pair 版本與 extractor baseline 調整。

---

## 1. 這份計畫如何使用

這不是把系統先拆成許多底層元件，最後才第一次組起來。每個 Phase 都必須產生一個可啟動的魔鏡版本，並在同一套 Admin／Developer Console 中提供：

- 該階段的新功能。
- 真實服務或實體設備測試。
- 在服務或設備尚未到位時可使用的 mock／simulation。
- 可重複執行的獨立 demo。
- 最近一次 demo 的版本、時間、結果及失敗原因。

Phase Exit Criteria 是「是否適合開始下一階段」的開發判斷，不是正式執行時的層層 runtime gate。正式運行採以下原則：

1. **不相關的功能不要互相阻塞。** Camera 壞掉不應阻止匿名對話；Fog 壞掉不應停止 Lighting 或語音。
2. **失敗必須看得見。** 影響訪客體驗的失敗要反映在主畫面；背景降級、drop 或 ignore 至少要出現在 Console。
3. **不建立 retry 迷宮。** 每次使用者操作中的外部呼叫最多一次有界重試；仍失敗就採明確 fallback。OfflineLoop 可定期做不建立 Realtime session 的輕量 health probe，但不在背景反覆重連完整對話。
4. **先完成單場域需要的路徑。** 不先建遠端後台、權限系統、微服務、通用 workflow engine 或多租戶能力。
5. **每次只引入一個主要未知數。** 先驗證 Realtime，再驗證 wake，再加入 Avatar、場景、Identity 與 Memory，問題比較容易定位。

## 2. Phase 總覽

| Phase | 主要成果 | 真實依賴 | 可先 Mock | 首次覆蓋的 User Stories |
|---|---|---|---|---|
| 0 Foundation | 可啟動主畫面、OfflineLoop、Console、AI Model Settings、telemetry、模擬器 | Electron、SQLite、本機影片 | OpenAI、Wake、Camera、Memory、Devices | US-FOUND-001、US-DEV-001 |
| 1 Realtime Voice | 由active config建立中文speech-to-speech、Persona、插話、雲端失效路徑 | OpenAI、網路、麥克風、輸出 | Realtime events、network failure | US-VOICE-001、US-OUTAGE-001（主要路徑） |
| 2 Wake Lifecycle | 自訂中文 wake、mic handoff、五分鐘休眠 | Wake model、實體麥克風 | Wake event、錄音語料、時間加速 | US-WAKE-001、US-IDLE-001 |
| 3 Avatar／Audio | Live2D 狀態、實際音訊嘴型、music ducking | Live2D rig、音訊輸出 | 開發用 rig、錄製音訊 | US-AV-001 |
| 4 Scenes | 完整咒語、timeline、Lighting／Fog／Music | Final transcript；最終驗收需實體設備 | 全部 device adapters | US-SCENE-001、US-SCENE-002 |
| 5 Identity／Profiles | 新客、回訪、多人 owner、換人、影像保存、embedding rebuild | Camera、face models、兩位測試者 | 測試影像、embedding provider、假記憶 | US-ID-001～US-ID-005 |
| 6 Memory | Recent／durable／Master Memory、自然更正 | Responses model、SQLite、Identity | Deterministic extractor、seed profiles | US-MEM-001、US-MASTER-001 |
| 7 Field Hardening | 實體整合、自啟動、備份、100 cycles、72h soak | 最終硬體與資產 | 故障注入仍可用 mock | US-DATA-001、所有 Must stories regression |

後一個 Phase 累積前一階段的成果；「獨立」指每個 Phase 都有自己的 runnable build 與明確 demo，不表示建立八套分離的程式。

## 3. Foundation Console 與 telemetry 基線

### 3.1 Console 形態

- Console 是同一個 Electron app 的第二個本機 `BrowserWindow`，不是另一套 server 或 web backend。
- 透過本機快捷鍵或主畫面隱藏入口開啟；Phase 1 不做遠端連線、帳號、角色、權限或 audit platform。
- Console 可在魔鏡主畫面運行時開啟，不把 `Admin` 當成新的 app lifecycle state。
- 會改動資料或啟動實體設備的按鈕明確標記為 Test／Apply；一般觀察不改變 runtime。
- 所有模擬功能只在 Developer Mode 啟用。正式場域可關閉模擬按鈕，但保留觀察與診斷。

### 3.2 Phase 0 固定頁面

1. **Overview**
   - App state、app version、build commit、config version。
   - Realtime、Wake、Audio、Avatar、Camera、Identity、Memory、Lighting、Fog、Music 的目前狀態。
   - Active conversation owner、目前 session ID、最後成功時間與最後錯誤。
2. **Simulator**
   - 模擬 wake、cloud disconnect、camera 0／1／多人、Avatar state、scene success／failure。
   - 各 Phase 逐步增加真實 test controls，不另建第二套測試工具。
3. **Events**
   - 最近事件的時間、module、event、status、duration、error code、session ID 與非內容 metadata。
   - 可依 module／status 過濾；錯誤必須附「發生了什麼」與「系統採取什麼 fallback」。
4. **Phase Tests**
   - 每個獨立 demo 的步驟、最新結果、執行 build、時間與備註。
   - 不做大型 test management system；只保存本 Prototype 所需的 smoke／acceptance 結果。
5. **Config**
   - 只呈現當前 Phase 已能使用的設定。
   - 設定失敗保留上一版，畫面顯示具體欄位錯誤，不以按下 Save 後沒有反應代替。
6. **Models**
   - 三張固定Cloud AI cards：Realtime Dialogue、Input Transcription、Memory Extractor。
   - 每張顯示Draft、Published Active、Runtime loaded、Previous、config fingerprint、SDK、最近contract test，以及`Pending next session`或`Pending next job`狀態。
   - 動作只有Test Draft、Publish、Rollback Entire Config to Previous；發布與回退前都顯示完整config diff，特別標出non-model變更。不做全市場dropdown、auto-latest或multi-provider router。

### 3.3 Telemetry 保存原則

可持久化：

- State transition、module status、duration、error code。
- Realtime connection、首音延遲、interrupt、usage metadata。
- Wake 偵測 metadata（keyword、設定 threshold／boost）、Camera candidate score、active face model version。
- Avatar FPS、audio underrun。
- Memory extraction success／failure、queue depth，不含內容。
- Scene／adapter result。
- Build、config、asset／model version 與 Phase test result。
- 每個activation／session／memory job使用的model role、requested model ID、config revision／fingerprint、SDK version、test result與fallback action；contract test事件另標`source=contract_test`，不得混成production usage。

不可持久化：

- 完整 user／assistant transcript。
- 對話 audio。
- 完整私人 memory context。
- Runtime face frames 或 embedding vectors。

Developer Mode 可在 RAM 顯示最近幾個 final transcripts，供咒語及記憶除錯；休眠、關閉 Developer Mode 或 app restart 時清除。

### 3.4 避免 silent fail 的共通規則

每個 module operation 統一回傳三種產品結果，不建立更多企業級狀態：

- `success`：動作完成。
- `degraded`：主體驗可繼續，但某項能力暫時不可用。
- `failed`：該動作無法繼續，已採用 visitor-visible fallback。

任何 ignored／dropped event 都要記錄 `reason`。常見 fallback 固定如下：

| Failure | Visitor path | Console |
|---|---|---|
| OpenAI／網路不可用 | 播放 OfflineLoop | 原始 error code、嘗試時間、下次 probe |
| Camera／face model 不可用 | 改問稱呼或 anonymous | Camera／model failure |
| 找不到人臉候選 | 正常詢問稱呼 | `no_candidate`，不是 error |
| Memory extraction 失敗 | 對話繼續，該回合不保存 | `memory_not_saved`＋原因 |
| 單一 scene adapter 失敗 | 其他對話／cue 繼續 | 失敗 adapter、timeout／error |
| Avatar animation 失敗 | 顯示靜態角色或 Maintenance asset | asset／render error |
| SQLite／核心設定不可用 | 顯示 Maintenance，不黑畫面 | integrity／config error |
| Wake worker 不可用 | 顯示 Maintenance；Console 仍可手動測試 | worker／model error |

## 4. 共通開發節奏

每個 Phase 使用同一個輕量流程：

1. 在 PR 或 Codex task 中列出要完成的 PRD Story ID。
2. 先加入 Console mock control 與人工 fixture，確認主畫面可走完整路徑。
3. 接上真實 service／device adapter。
4. 執行本 Phase Independent Demo。
5. 把結果記入 Console 的 Phase Tests。
6. 執行前面 Phase 的短版 regression smoke。
7. 建立可回復的 phase release tag，再開始下一 Phase。

不要求每個小變更都重跑 72 小時或全套 corpus。完整 100-cycle、72-hour 與最終硬體測試只在 Phase 7 執行。

## 5. Phase 0 — Foundation／Visible Skeleton

### Goal

建立一個永遠有畫面、能模擬所有未來路徑、從第一天即可與 Codex／Claude Code共同除錯的軟體骨架。

### Start Conditions

- Mac／開發機可執行 Electron。
- 有暫用 Dormant、Waking、Maintenance 圖及 OfflineLoop 影片。
- 不要求 OpenAI credential、Camera 或任何實體效果設備。

### Scope

- Electron Main＋Mirror Renderer＋Console Renderer。
- 頂層 lifecycle：Starting、Dormant、Activating、Active、Suspending、OfflineLoop、Maintenance。
- 單一 config schema／`ConfigService`、SQLite 初始化及 migration baseline；持久化仍使用`active.json／draft.json／previous.json`三份明確狀態。
- `active.json／draft.json／previous.json`中的三角色AI Model Settings、Main-owned session／job snapshots與共用config resolver；source code不放model ID default。
- Metadata-only rotating event log。
- OfflineLoop 預載與無縫播放。
- OpenAI、Wake、Camera、Identity、Memory、Lighting、Fog、Music mock adapters。
- 基本錯誤邊界：Renderer crash 不留下黑畫面；核心資產／DB 失敗顯示 Maintenance。
- 版本基線：Electron pin 43.x；SQLite 採 `node:sqlite`（WAL pragma＋online backup API）。
- macOS 打包基線從 Phase 0 進 build 設定：Info.plist `NSMicrophoneUsageDescription`／`NSCameraUsageDescription`、`com.apple.security.device.*` entitlements 與 hardened runtime——TCC 對 spawned worker 是**靜默拒絕（無對話框）**，缺 key 時看起來像硬體壞掉；Console Audio／Camera 卡片顯示 TCC 授權狀態。LaunchAgent 為唯一 app-level restart owner，程式內不用 `app.relaunch()`。

### Console Increment

- 完成 §3 的 Overview、Simulator、Events、Phase Tests、Config shell。
- 完成Models頁三張card與Active／Draft／Runtime／Previous diff；Phase 0以fake model IDs和mock factory驗證資料流，不需OpenAI credential。
- 所有 module 明確顯示 `not_implemented／ready／degraded／failed`，但狀態只供觀察，不成為全域 gate。
- 模擬 Dormant、Wake、Active、OfflineLoop、Maintenance 及各 adapter 結果。

### Independent Demo

- **P0-D1 Lifecycle：** 啟動 app → Dormant → 模擬 wake → Activating → Active → Suspending → Dormant。
- **P0-D2 Visible failure：** 模擬 cloud failure → OfflineLoop；模擬 SQLite failure → Maintenance；兩者皆不得黑畫面。
- **P0-D3 Observability：** 從 Console 找到每次 transition、最後錯誤及使用的 fallback。
- **P0-D4 Restart：** 重啟 app，確認 config、Phase test result 與 metadata events 可讀。
- **P0-D5 Model settings：** 修改Draft中的三個fixture model ID；mock session／transcription／extractor factory收到完全相同的值。Publish後既有mock session／job仍顯示舊snapshot，下一個新session／job才載入新revision；整份Rollback會先顯示非model diff。測試結果必須標`Mock passed`與`source=simulator`，不可顯示成真實`Contract passed`。

### Exit Criteria

- 連續啟動 10 次皆顯示 Dormant 或 Maintenance，不出現空白畫面。
- OfflineLoop 連續播放 30 分鐘，不出現明顯 memory growth 或播放中止。
- 每個 mock action 都有畫面結果及 Console event。
- Model ID source scan只允許packaged config、migration／test data與文件出現；Voice／Memory runtime module不得有model literal或hidden fallback。
- 無效Draft或mock contract failure不改Active、不partial publish，Console直接顯示原因。
- P0-D1～D5 可由非原開發者依文件重複完成。

### What Can Be Mocked

所有外部服務與硬體；Phase 0 的驗收重點是 lifecycle、畫面及可觀察性。

### 不做什麼

- 不接 OpenAI、Camera 或實體設備。
- 不建立遠端 Admin backend、登入、權限、雲端 telemetry 或通用 plugin framework。
- 不先實作最終資料 schema、複雜 IPC envelope 或多程序 heartbeat matrix。

## 6. Phase 1 — Realtime Voice／Cloud Failure

### Goal

驗證核心中文對話體驗：Persona、OpenAI 內建 Voice、低延遲 speech-to-speech、插話，以及雲端失效時可靠進入 OfflineLoop。

### Start Conditions

- Phase 0 Exit Criteria 通過。
- OpenAI credential、正常網路、PoC 麥克風與輸出裝置可用。
- 有一版暫用 Persona instructions 與 1～3 個 built-in Voice 候選。

### Scope

- 使用官方 OpenAI Agents SDK `RealtimeSession`＋WebRTC。
- Production與contract test使用同一config resolver，分別從Draft／SessionModelSnapshot取得Realtime Dialogue、Input Transcription、內建Voice、reasoning與app-level turn-detection profile；初始baseline只見PRD §6.1。
- 採 SDK 的 Voice Activity Detection 與 interruption 能力；adapter負責把app-level profile映射當期SDK，不重建一套Realtime protocol state machine。
- App 只保存目前 `sessionGeneration`，忽略已關閉 session 的遲到事件。
- Final transcript 只在 RAM 中供 Console 及後續功能使用。
- 正式模式明確關閉 Agents SDK model／tool data tracing、Realtime audio history及可能保存內容的 debug log；不能只依賴預設值。
- 手動 Console Wake；自訂 wake word 留到 Phase 2。
- Connect failure、ICE failure 或 Active disconnect → 停止 AI audio → OfflineLoop。
- 進入 OfflineLoop 時關閉 session並清除 active owner與RAM transcript；恢復後只回Dormant，不續接舊對話。
- 輕量 recovery probe；服務恢復後回 Dormant，不續接中斷的句子。
- Contract test 追加項（2026-08 驗證所得）：config 值確實到達 session（SDK 隱含預設 transcription model `gpt-4o-mini-transcribe`，不得成為 hidden fallback）；`close()` 後明確停止 app 自有 mic tracks；playback completion 以 raw `output_audio_buffer.stopped` 為準；60 分鐘上限 rollover 以新 client secret＋新 session 重建（SDK 無 reconnect API）。

### Console Increment

- Credential／client-secret probe、Realtime connect／disconnect。
- Connection state、session generation、首音延遲、interrupt、usage 與最後 error。
- Draft／Published Active／Runtime loaded的model ID、config revision／fingerprint、SDK version、contract result與activation boundary。
- 手動 Start Conversation、Interrupt、Disconnect、Simulate Cloud Failure。
- Developer Mode RAM transcript panel；預設關閉且永不落盤。

### Independent Demo

- **P1-D1 Voice：** Console 啟動 session，完成 20 個繁中或中英混合回合。
- **P1-D2 Barge-in：** 在 AI 說話時插話 10 次；聲音停止後新回合仍可得到回答。
- **P1-D3 Wake-time outage：** 模擬啟動後 connect failure，五秒內進 OfflineLoop。
- **P1-D4 Active outage：** 對話中斷網，AI audio 停止並進 OfflineLoop；恢復後回 Dormant，再手動喚醒成功。
- **P1-D5 Model contract：** 對Draft的Realtime Dialogue＋Input Transcription跑真實短測，Publish後下一個新Realtime session的telemetry顯示相同revision／requested IDs；無效Draft測試失敗但現有Active不變。
- **P1-D6 Snapshot boundary：** session中途Publish，當前session仍使用原`SessionModelSnapshot`；forced new session或accelerated rollover建立的新session才使用Published Active。

### Exit Criteria

- 20 回合對話無卡死或 session 重複播放。
- 10 次真人插話皆能停止當前輸出並繼續新回合；精確 P95 指標留到 Phase 7。
- 兩種 outage 路徑都能顯示 OfflineLoop 與具體 Console error。
- Realtime history、audio、RAM transcript 在 session close 後清除。
- 以測試秘密句掃描本機 log、SQLite 與 diagnostic export，結果為 0。
- Publish不改動當前Realtime session；forced new session與rollover都使用建立當下的Published Active並凍結自己的`SessionModelSnapshot`。Profile switch與memory job分別於Phase 5、6驗證。
- Configured model不可用時不自動換model：Realtime失敗進OfflineLoop；transcription失敗時Voice繼續但依賴final transcript的功能明確degraded。

### What Can Be Mocked

CI／開發時可使用 recorded Realtime events 與 forced disconnect；Exit Criteria 中的 P1-D1、D2 必須使用真實 OpenAI session。

### 不做什麼

- 不做自訂 wake、Avatar lipsync、Identity、Memory 或 scenes。
- 不自建 WebRTC SDP／data channel、sideband server、MCP、handoff 或 multi-agent orchestration。
- 不用 Realtime model 的 tool call直接寫入記憶。

## 7. Phase 2 — Wake Word／Lifecycle

### Goal

讓訪客不碰裝置即可完成 wake → talk → sleep，且網路失效時 wake 仍然有效。

### Start Conditions

- Phase 1 真實 Realtime demo 通過。
- 有暫定或正式中文 wake phrase、可用 wake model 及實體麥克風。

### Scope

- 本機 wake worker 與自訂中文 keyword model。
- Dormant 時 wake worker 持有 microphone；喚醒後 release，再由 Realtime acquire。
- 先顯示 Waking 畫面，再等待 Realtime connection。
- 最後一次有效 user turn 或 Assistant playback 完成 300 秒後休眠。
- 明確「睡吧」結束目前回覆後休眠。
- 已知雲端失效時仍接受 wake，喚醒後直接進 OfflineLoop。
- Developer Mode 可把 300 秒縮成 15／30 秒；正式設定維持 300 秒。
- Wake stack pin：`sherpa-onnx ≥ 1.13.5`（1.13.4 的 KWS 在 M4／SME Apple Silicon 上**靜默偵測不到任何關鍵詞**，#3791）；「已知 WAV 必偵測」smoke assertion 納入 P2 之後的回歸，防止版本升級靜默退化。每次偵測後明確 `reset(stream)`。

### Console Increment

- Wake worker status、selected mic、model／phrase version、設定 threshold／boost、最近 detection（KWS 引擎不輸出 per-event confidence；threshold 調參靠 recorded corpus runner 離線進行）。
- Wake threshold 調整、recorded WAV corpus runner、Simulate Wake。
- Mic owner、release／acquire result、idle timer 與 last reset reason。

### Independent Demo

- **P2-D1 Local wake：** 從 Dormant 真人說 wake phrase，進入真實 Realtime 對話。
- **P2-D2 Offline wake：** 先斷網，再說 wake phrase，進入 OfflineLoop。
- **P2-D3 Idle：** Developer Mode 30 秒無互動後回 Dormant，再確認正式設定為 300 秒。
- **P2-D4 Sleep command：** 說「睡吧」，完成目前回覆後關閉 session並交回 microphone。
- **P2-D5 Mic ownership：** Console timeline 證明 wake worker 與 Realtime 沒有同時持有 microphone。

### Exit Criteria

- 現場 20 次真人 wake 至少成功 19 次；完整 5 人 corpus 與 8 小時 ambient test 留到 Phase 7。
- 30 分鐘固定日常談話／電視語料沒有誤喚醒。
- Offline wake、idle、sleep command 均回到明確狀態，不留下活的 Realtime session。
- Mic acquire 失敗會進入 Maintenance，Console 顯示 mic acquire error，不 silent retry。

### What Can Be Mocked

時間、Wake event、錄製語料與 cloud status 可 mock；最終 Exit 需至少使用 PoC 真實麥克風。

### 不做什麼

- 不建多房間 voice satellite。
- 不在 Active 中同時運行另一套 wake detector。
- 不做複雜 audio arbitrator；只需要 wake owner與Realtime owner 的 release／acquire。

## 8. Phase 3 — Avatar／Audio

### Goal

把 Phase 2 的語音變成可信的角色：狀態自然、嘴型跟隨實際聲音、音樂不妨礙交談。

### Start Conditions

- Phase 2 lifecycle 穩定。
- 至少有一個開發用 Live2D rig；不等待最終半寫實角色完成。
- 有本機測試音樂及 OfflineLoop asset。

### Scope

- Live2D Dormant、Waking、Listening、Thinking、Speaking、Scene、Suspending、OfflineLoop。
- 眨眼、呼吸、微頭動與平順 transition。
- 以實際播放的 Realtime audio analyser 驅動 mouth open，不以字幕時間猜測。RMS／analyser 路徑是 Phase 3 Exit 基線；Live2D MotionSync 為選配強化（proprietary Core 需 vendoring、SDK sibling-directory 佈局），不作為 exit 條件。
- Interruption／disconnect 時聲音與嘴型同步停止。
- 獨立 AI voice／music gain；AI 說話時 duck、結束後恢復。
- Music play、stop、fade in、fade out。

### Console Increment

- 手動切換 Avatar states／expressions／motions。
- 顯示 FPS、audio waveform、mouth value、audio underrun、voice／music gain。
- 播放錄製 AI audio，讓 Avatar 可在沒有 OpenAI 的情況下單獨測試。

### Independent Demo

- **P3-D1 State journey：** Dormant → Waking → Listening → Thinking → Speaking → Scene → Suspending。
- **P3-D2 Lipsync：** 分別播放錄音與真實 Realtime audio，嘴型由實際 output 驅動。
- **P3-D3 Interrupt：** AI 說話時插話，聲音、嘴型及 pending expression 同步停止。
- **P3-D4 Music：** 播放音樂、AI 說話時 duck、結束恢復、Dormant／OfflineLoop 前 fade out。

### Exit Criteria

- 10 分鐘 Realtime＋Avatar 對話沒有嘴型卡住或明顯 audio underrun。
- 開發用 asset 在目標 Mac 接近 60 FPS；最終 asset 的 P95 驗收留到 Phase 7。
- 10 次 interruption 都同步清除聲音與 mouth motion。
- Avatar asset failure 有靜態 fallback／Maintenance asset，不黑畫面。

### What Can Be Mocked

可使用開發用 Live2D rig、錄製音訊及 synthetic waveform；P3-D2 仍需至少一次真實 Realtime audio。

### 不做什麼

- 不做 3D、即時生成影片、換裝、多 Avatar 或 Persona Pack。
- 不為嘴型另加 cloud lip-sync service。
- 不建立複雜 animation workflow editor。

## 9. Phase 4 — Spells／Scenes

### Goal

先完成產品的「魔幻效果」核心價值：完整咒語可靠觸發 Lighting、Fog、Music，同時維持對話可用。

### Start Conditions

- Phase 3 的 final transcript、Avatar 與 audio graph 可用。
- 已定義至少三條咒語、三個 scene presets 及預期 cue timing。

### Scope

- 本機 normalizer＋exact full-transcript matcher。
- 每個 `turnId` 最多觸發一次；小型 RAM dedupe 即可。
- Phase 1 所需的 cue、delay、preset、cooldown、timeout。
- Lighting、Fog、Music 各一個 typed adapter 與 mock。
- Adapter failure 不阻塞對話；可成功的其他 cue 繼續。
- 本機核准音檔、ducking、stop、fade。

### Console Increment

- Spell／normalization preview、Simulate Final Transcript。
- Scene／cue timeline viewer；可逐一 Test Cue 或 Run Scene。
- Adapter connection、最近 command、duration、success／timeout／failure。
- 明確顯示「為何沒有觸發」，例如 `partial_transcript`、`not_exact_match`、`cooldown`。

### Independent Demo

- **P4-D1 Exact match：** 20 個完整正例全部觸發。
- **P4-D2 Negative corpus：** 30 個部分句、相似句、否定句、附加文字都不觸發，Console 顯示 reason。
- **P4-D3 Timeline：** 三個場景分別以 mocks 完整走完 Avatar＋Lighting／Fog／Music cue。
- **P4-D4 Failure：** 模擬 Fog timeout；Lighting、Music、對話仍可繼續，Console 指出 Fog failure。
- **P4-D5 Physical smoke：** 若硬體已到位，各 adapter 至少送出一次實體 command；未到位則記為 Phase 7 blocker，不阻止 Phase 5。
- **P4-D6 Transcript unavailable：** 對話仍可繼續，但scene command＝0；Console顯示transcription role、fingerprint與`transcript_unavailable` skip reason。

### Exit Criteria

- 固定 20 positive＝100% trigger；30 negative＝0 false trigger。
- 相同 `turnId` 重送不會執行第二次。
- 三個 mock scenes 都能獨立完成並產生可理解的 result。
- 實體設備未到位時，adapter contract 與 mock 必須完成；最終實體驗收不可略過 Phase 7。

### What Can Be Mocked

Lighting、Fog、Music device transports與所有 error；本機音樂播放及 final transcript 必須真實驗證。

### 不做什麼

- 不讓 LLM 生成任意 DMX channel、煙霧秒數或設備參數。
- 不建通用 scene editor、workflow engine、MQTT bus、Home Assistant 或跨房間系統。
- 不以 semantic similarity 取代完整咒語。

## 10. Phase 5 — Identity／Profiles／Re-embedding

### Goal

以最簡單可理解的方式辨認回訪者：Camera 只提出候選，口頭確認後才載入 Profile；同一批來源影像可反覆建立新 embeddings。

### Start Conditions

- Phase 1～3 的 Realtime、lifecycle 與 Console 穩定。
- UVC Camera、face detector／embedding model 可在 Mac 執行；`opencv-python` 與 zoo model 成對明確 pin（4.x＋`yunet_2023mar` 或 5.x＋`yunet_2026may` 擇一，不混用），模型檔經 Git-LFS 實體下載驗證（`raw.githubusercontent.com` 只會拿到 pointer 檔）。
- 至少兩位已同意測試的訪客。

### Scope

- Profile 使用 UUID；Phase 1 的 `call_name` 唯一，重名者選不同鏡中稱呼。
- Wake 時 Camera 短暫 capture：單一可信候選就詢問；無候選就問稱呼；多人就問 conversation owner 或 anonymous group。
- 口頭確認前的 session 只有 Persona＋當前 Master Memory，不載入私人資料。
- `candidateProfileId` 只由 Main 保存；確認 parser／tool 只回傳明確肯定、否定或模糊，不接受模型提供 guest ID。
- 確認問題開始播放後的下一個完整 user turn才是確認回答，允許 barge-in；模糊最多重問一次，之後問稱呼或 anonymous。
- 確認後不持續做人臉 identity tracking；owner 維持到明確換人或休眠。
- 換人時關閉舊 Realtime session，再用乾淨 session 確認新 owner；確認後在同一條乾淨 session載入新 owner，不建立第三條連線。
- 註冊保存 5～8 張原始 full-frame source images；face crop 與 embeddings 都是 derived data。
- Source manifest：guest UUID、relative path、SHA-256、capture time、image size、quality、crop metadata、consent time。
- Embedding record：source image ID、detector＋recognition model 成對 ID／version／檔案雜湊、preprocess version、dimension、created time；detector 換版視為新 embedding 版本（alignCrop 依 detector landmarks）。
- Rebuild 先寫入新 batch；完成後由 Console 手動切 active model。失敗保留舊版，不要求重拍。
- Runtime recognition frames 不保存。

### Console Increment

- Profile list／editor、active owner、candidate、match score。
- Enrollment capture、source image thumbnails／manifest、Delete Current Source。
- Embedding model list、Rebuild Progress、batch comparison、Activate／Rollback。
- Camera 0／1／multiple mock 與 recorded image gallery runner。

### Independent Demo

- **P5-D1 Anonymous／new guest：** 拒絕 Profile 可對話；建立 Profile 不註冊人臉也可繼續。
- **P5-D2 Enrollment：** A、B 各保存 5～8 張來源影像，manifest／hash 完整。
- **P5-D3 Return candidate：** 重啟後辨識 A；口頭確認前讀不到 A mock memory，確認後才載入。
- **P5-D4 Reject：** 候選是 A，訪客回答不是；改問稱呼或 anonymous，沒有載入 A。
- **P5-D4b Bound confirmation：** 在提問前的「對」、提問開始後的插話「對」、模型送出非候選 ID及模糊回答，都得到可預測結果且不會載錯 Profile。
- **P5-D5 Multiple people：** A、B 同時出現，由 A 指定並確認；其他人進出不自動更換 owner。
- **P5-D6 Switch：** A 對話中說換成 B；舊session關閉，B的乾淨新session看不到A history；若A session期間已Publish，B session使用建立當下的Published Active並記錄自己的snapshot。
- **P5-D7 Re-embed：** 換另一個 embedding provider／version，從來源影像建立新 batch、切換、再 rollback，全程不重拍。
- **P5-D8 Confirmation transcript unavailable：** 身分確認回合沒有completed transcript時不載入Profile，先口頭請訪客重說一次；再失敗則以anonymous繼續，Console明示降級原因。

### Exit Criteria

- A／B 流程完整通過；recorded same-person／different-person gallery 結果可由 Console 重跑。
- 口頭確認前私人 context access＝0；明確 A→B 後 cross-session A history＝0。
- 所有來源影像可由 manifest 找回且 hash 正確。
- 新 embedding batch 失敗會保留舊 active batch並顯示 error。
- 產品限制清楚：不做逐句說話者辨識，也不自動發現未明確換人的 A→B 接手。

### What Can Be Mocked

可使用 recorded images、embedding provider adapter、假 Profile memories；Enrollment、Camera capture 與至少兩位真人 return flow 必須真實測試。

### 不做什麼

- 不做 continuous face monitoring、speaker diarization、voiceprint 或強身分驗證。
- 不做 identity／write epochs、challenge UUID chain、多人自動撤銷 owner。
- 不做同名 disambiguation graph、Profile merge 或關係圖。
- 不把來源影像或 embeddings 寫入一般 telemetry。

## 11. Phase 6 — Guest Memory／Master Memory

### Goal

讓口頭確認過的回訪者得到自然延續感，同時維持 Profile 隔離；記憶失敗不影響當下對話。

### Start Conditions

- Phase 5 owner confirmation 與 switch flow 穩定。
- 一個支援 Structured Outputs 的 OpenAI Responses model 可用（Draft baseline `gpt-5.6-luna`；`gpt-5.6-terra` 作 A/B 候選）。
- 該model由Draft的`aiModels.memoryExtractor`指定，並已有可測的`memory-v1` schema fixture。
- 已準備合成的 Guest A／B 記憶測試資料。

### Scope

- SQLite `recent episodes`、`durable facts`、`master entries`。
- Memory extractor在每個job enqueue時由Published Active建立`JobModelSnapshot`；job保存model ID、schema version與config revision，執行中不改讀current config。
- Final transcript 只在 RAM 進入 extractor；完成、ignore 或 failure 後清除。
- 每個 extract job 保存 `ownerProfileIdAtTurnStart`，完成時不改查目前 owner。
- 每個 user turn 另帶 `memoryEligible` 與簡單 `controlIntent`；確認、換人、建 Profile、群組選擇、sleep 等控制回合一律不抽取個人記憶。
- 自然自述建立 recent／durable candidate；自然更正 supersede 舊值。
- Assistant 猜測、anonymous／group內容不寫私人記憶。
- Profile 確認後注入 active durable facts＋最近 episodes；anonymous／group 只有 Persona＋Master。
- Master Memory 由 Console 編輯，下一個 Realtime session 生效。
- Phase 1 不提供訪客 list／remember／forget／forget-me tools。
- 小資料量採 typed SQL 與時間／類型排序；FTS5 可作可選查詢，不成為 Phase 1 runtime gate；不使用外部 memory framework 或 vector DB。

### Console Increment

- Guest recent／durable memory viewer、edit、disable、delete。
- Master Memory editor 與「next session生效」提示。
- Extract queue、success／ignored／failed count、owner-at-turn、latency；不顯示持久化 transcript。
- Deterministic extractor mock、seed A／B profiles、Simulate Extract Failure。
- Memory Extractor Draft contract test、fingerprint、Publish／Rollback結果；明示既有job不變、新設定於下一個enqueue的job生效。

### Independent Demo

- **P6-D1 Cross-session recall：** A 明確說偏好 → sleep → 回訪確認 → 魔鏡自然使用正確內容。
- **P6-D2 Isolation：** B 回訪時不得取得 A 的 facts、episodes 或 prompt context。
- **P6-D3 Natural correction：** A 說「我現在不喝咖啡了」；下次只使用新值。
- **P6-D4 Anonymous／group：** 可使用 Master Memory，但不讀寫 Guest memory。
- **P6-D4b Master publish：** Console新增、修改、停用及刪除Master entry；目前session不變，下一個Realtime session才使用新內容。寫入失敗保留舊版並顯示原因。
- **P6-D5 Switch during extraction：** A 的 job 延遲完成後仍只寫 A，不改寫 B。
- **P6-D5b Control turn：** A→B 的換人句、B 的確認句及 group selection 都產生 0 筆 personal memory candidate。
- **P6-D6 Memory input／extract failure：** extractor失敗或completed transcript unavailable時，對話都不中斷且寫入0筆；Console分別顯示`memory_not_saved`及明確原因。
- **P6-D7 No transcript persistence：** 搜尋 DB、backup及 rotating logs，不含完整測試 turn text。
- **P6-D8 Model iteration：** 以第二個相容model ID或test double建立Draft，通過固定schema contract後Publish；in-flight job仍顯示舊revision，同一activation中下一個enqueue的新job即使用新revision。

### Exit Criteria

- 30 個人工 memory cases 通過；最終擴充 corpus 可在 Phase 7 執行。
- Cross-profile recall／write＝0。
- Natural correction 不再注入舊 active value。
- Extractor timeout／failure 不阻塞 Realtime response或idle lifecycle。
- DB、backup、production telemetry 不包含完整逐字稿或音訊。
- Production request與contract test使用同一extractor config resolver；model切換不改SQLite schema或memory action語意。

### What Can Be Mocked

Extractor、Responses failure、seed profiles與時間；至少一次真實 Responses Structured Output extraction 必須通過。

### 不做什麼

- 不做訪客顯式記憶控制、privacy-grade erasure 或刪除 journal。
- 不做 Supermemory、Mem0、向量資料庫、knowledge graph 或假精確綜合分數。
- 不做 immutable Master revision bundle／digest pointer；一般 SQLite transaction與backup已足夠。

## 12. Phase 7 — Field Integration／Hardening

### Goal

把所有已獨立驗證的垂直切片放入最終場域與硬體，完成可長時間運行的完整 Prototype。

### Start Conditions

- Phase 0～6 全部 Independent Demo 通過。
- 最終 Avatar、Persona、Voice、wake phrase、OfflineLoop、三條咒語及三個 scenes 已定案。
- PoC／最終 audio、Camera、Lighting、Fog、Music control 已到位。

### Scope

- macOS 自動登入後啟動與基本 process restart。
- 最終 audio、Camera、Live2D asset、DMX／Fog／Music adapters。
- Wake／face／audio／scene 現場 calibration。
- 備份包含 SQLite、active／draft／previous config、registration source images與face model manifest。
- Console 手動 backup、backup time、Dormant／Maintenance restore與integrity check。
- Admin 刪除 Profile 只刪 active DB rows／目前資料目錄；舊 rotation backup 依正常週期淘汰，不承諾 privacy-grade erasure。
- 全流程 regression、故障注入、100 cycles、72h soak。

### Console Increment

- 完整硬體 health／test controls、device latency與最後 command。
- Backup／restore、source image integrity、disk usage。
- Wake／face calibration corpus result、Realtime latency、FPS、underrun。
- Lifecycle counter、soak duration、process restart、queue high-water mark。
- 一鍵匯出 metadata-only diagnostic bundle；不含 credential、transcript、audio、private context或runtime face frames。

### Independent Demo

- **P7-D1 Golden path：** Cold boot → wake → Profile confirm → recall → conversation → spell scene → music／barge-in → explicit switch → sleep。
- **P7-D2 Cloud outage：** Dormant 時斷網後 wake → OfflineLoop；恢復 → Dormant → 重新 wake成功。
- **P7-D3 Degraded modules：** 拔 Camera後改問名字；Fog timeout時其他功能繼續；extractor failure時對話繼續。
- **P7-D4 Recovery：** Renderer／app process kill 後自動重新顯示 Dormant、OfflineLoop 或 Maintenance，不黑畫面。
- **P7-D5 Backup／restore：** 建立 A 的 Profile、來源影像與記憶 → backup → 修改 → restore → 驗證 DB、影像 manifest，以及`active／draft／previous` Model Settings fingerprint全部一致。
- **P7-D6 Lifecycle：** 100 次 wake／talk-or-mock-turn／scene-or-no-scene／sleep。
- **P7-D7 Soak：** 先 2 小時，再 overnight，最後執行 72 小時定義 workload。

### Exit Criteria

- §13 Traceability Matrix 的 17 個 Must stories 全部有實機證據。
- 100 次 lifecycle 無 deadlock、黑畫面或必須人工介入的卡死。
- 72 小時無人工重啟、SQLite corruption、unbounded queue或持續 memory growth。
- 最終場域達到 PRD NFR；若某項未達，Console 有量測結果與明確調校項，不以 silent fail或擴建平台掩蓋。
- 備份／還原至少完成一次真實演練。

### What Can Be Mocked

故障注入可用 mocks；Golden Path、Wake、Realtime、Avatar、Camera、三類實體效果、backup／restore與soak不可只使用 mock。

### 不做什麼

- 不在 hardening 時順便加入 Phase 2 的多 Persona、客製 Voice或訪客記憶控制。
- 不因單場域長測而導入 Kubernetes、微服務、遠端 observability vendor、Temporal或企業級 deployment pipeline。
- 不把 72 小時測試變成每次 commit 的開發 gate。

## 13. 17 個 User Stories Traceability Matrix

| PRD User Story | 首次交付 Phase | Independent Demo／主要證據 | 最終驗證 | Mock 邊界 |
|---|---:|---|---|---|
| US-FOUND-001 | 0 | P0-D1、D2、D4 | P7-D4、100-cycle | 核心畫面／SQLite不可全 mock |
| US-DEV-001 | 0，後續持續擴充 | P0-D3、D5；每Phase Console Increment | P7 diagnostic bundle＋model binding／test history | Simulator可mock，Console與config resolver不可 |
| US-VOICE-001 | 1 | P1-D1、D2、D5 | P7-D1＋Realtime NFR | CI events可mock；model contract與Exit需真實OpenAI |
| US-WAKE-001 | 2 | P2-D1、D2、D5 | P7-D1、D2＋現場 wake corpus | Event／WAV可 mock；Exit需真人＋mic |
| US-AV-001 | 3 | P3-D1～D3 | P7-D1＋FPS／mouth latency | 開發 rig／錄音可 mock；最終 asset不可 |
| US-OUTAGE-001 | 1；Phase 2補local wake | P1-D3、D4、P2-D2 | P7-D2 | Cloud failure可注入；影片播放不可 |
| US-ID-001 | 5 | P5-D1 | P7-D1、D3 | Profile fixture可 mock；真人建立流程不可 |
| US-ID-002 | 5 | P5-D2、D7 | P7-D5＋source integrity | Recorded images可輔助；實際 enrollment不可 |
| US-ID-003 | 5 | P5-D3、D4、D8 | P7-D1 | Mock memory可用；口頭確認需真人 |
| US-ID-004 | 5 | P5-D5 | P7-D1 多人版本 | Camera result可 mock；至少一次真人多人測試 |
| US-ID-005 | 5 | P5-D6 | P7-D1 switch path | Profiles可seed；Realtime history isolation需真實 session |
| US-MEM-001 | 6 | P6-D1～D3、D5、D5b、D6～D8 | P7-D1、D3、D5 | Extractor可mock；至少一次真實configured Responses call |
| US-MASTER-001 | 6 | P6-D4、D4b | P7-D1、D5 | Master entries可seed；session生效需真實驗證 |
| US-SCENE-001 | 4 | P4-D1～D6 | P7-D1、D3 | Adapter可mock；最終三類設備不可 |
| US-SCENE-002 | 4 | P3-D4、P4-D3 | P7-D1 | Track／device可mock；本機 audio graph不可 |
| US-IDLE-001 | 2 | P2-D3、D4 | P7-D1、100-cycle | Timer可加速；最終300秒至少驗一次 |
| US-DATA-001 | 7 | P7-D5 | Restore report＋image manifest | Fault可mock；至少一次真實backup／restore |

### 13.1 Coverage 判定

- 17／17 stories 均有首次交付 Phase。
- 17／17 stories 均有可重複執行的 Independent Demo 或明確證據。
- 所有依賴硬體的 stories 都允許開發期 mock，但 Phase 7 明確要求真實設備。
- 沒有把 Phase 2 的訪客記憶控制偷放回 Phase 1。

## 14. Codex／Claude Code 工作單位

每個實作 task 建議維持 0.5～2 天可完成的大小，格式如下：

```text
Story / Phase:
User-visible outcome:
Files / modules expected to change:
Console control or telemetry to add:
Happy-path test:
Failure / fallback test:
Explicit non-goals:
Demo step affected:
```

完成一個 task 至少提供：

- 對應 Story／Phase。
- 使用者可看見的結果。
- 一個 happy-path test。
- 一個 failure／fallback test。
- Console event 或 metric。
- 沒有新增 transcript／audio persistence 的確認。

只有在既有標準庫或 module確實無法解決需求時才新增 dependency；新增時說明它服務哪個 Story，不要求建立大型 approval gate。

## 15. 2026-08 OpenAI 實作對齊

- PRD §6.1集中記錄2026-08的三個初始baseline；runtime不引用本章或PRD文字，只從versioned config解析。Realtime reasoning的`low`只是一個初始Draft值，可在相同contract與NFR下迭代。
- Browser／Electron Renderer 使用官方 Agents SDK `RealtimeSession`＋WebRTC，是目前最低摩擦的即時語音路徑；SDK 已處理 Voice Activity Detection、interruption及local session history。
- App 只在需要 final transcript、scene exact matching或RAM memory extraction時讀取相關事件，不複製 SDK 的完整狀態機。
- Realtime Dialogue role的初始baseline不支援Structured Outputs，因此Phase 6以獨立、可設定且通過schema contract的Memory Extractor role做記憶抽取。
- Profile 換人時仍關閉舊 Realtime session，原因不是企業級安全流程，而是 `RealtimeSession` 會保留 conversation history；乾淨 session 是移除舊 Profile內容最直接的方式。
- SDK版本或任一model role fingerprint變更，只重跑受影響role的contract test；不需要重跑無關的face、DMX或72小時測試。任何失敗都不silent fallback。

官方依據：

- [GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [GPT Live Transcribe](https://developers.openai.com/api/docs/models/gpt-live-transcribe)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI Agents SDK — Building Voice Agents](https://openai.github.io/openai-agents-js/guides/voice-agents/build/)
- [OpenAI Agents SDK — Realtime transport](https://openai.github.io/openai-agents-js/guides/voice-agents/transport/)
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## 16. 最終完成判定

本計畫完成不等於「所有程式碼都有最高覆蓋率」，而是以下事實同時成立：

1. 訪客可以不用碰裝置完成 wake → confirm／anonymous → talk → scene → sleep。
2. 雲端失效時固定特效影片一定出現，主持人能從 Console 看見原因。
3. 新客、回訪、多人指定 owner與明確換人都能用人話完成。
4. 保存的 registration images能重建另一版 embeddings，不需找賓客重拍。
5. Guest A／B 記憶不互相出現；抽取失敗不影響對話。
6. Lighting、Fog、Music 的 mock及實體路徑都已測試。
7. 每一個 ignore、fallback與failure都有主畫面結果或 Console event。
8. 17 個 Must stories、100 lifecycle及72-hour soak都有可查看的驗收證據。

達成以上結果後，才開始評估 Phase 2；不在 Phase 1 尾聲用「順便先做」重新引入多 Persona、客製 Voice、訪客記憶控制或企業級平台。
