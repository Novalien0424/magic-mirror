# 魔鏡 AI Avatar：Software PRD

**版本：** 0.3.1  
**日期：** 2026-08-16  
**狀態：** Build-ready baseline  
**產品類型：** 單一私人招待所、單場域客製 Prototype  
**相關文件：** `Magic_Mirror_Tech_Spec_v0.3.md`、`Magic_Mirror_Implementation_Plan_v0.3.md`、`Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md`

> **v0.3.1（2026-08-16）：** 依 stack adversarial review 校正兩處產品層敘述——wake 遙測改記 keyword 與設定 threshold（所選 KWS 引擎不輸出 per-event confidence，產品不得宣稱）；embedding 版本改以 detector＋recognition model 成對記錄。技術層修訂見 Tech Spec 與 Implementation Plan 同日版本。

---

## 1. 產品定義

一面具備固定人格、能以中文自然交談、辨認回訪賓客並記得過往互動的魔鏡。它以半寫實 2D Avatar 呈現；訪客說出完整咒語時，系統會同步控制燈光、煙霧或本機音樂，形成一個連續而可信的魔幻角色體驗。

Phase 1 不是商業化平台，而是在一台 Mac mini、單一房間內完成的可長期調整 Prototype。軟體必須容易由人、Codex 或 Claude Code 逐步修改、測試與觀察。

## 2. v0.3 的核心修正

相較 v0.2，本版刻意降低執行複雜度：

- 保存賓客同意後拍攝的註冊來源影像，讓人臉模型可反覆更換並重新產生 embedding，無需重新註冊。
- 人臉只在喚醒時提出 Profile 候選；口頭確認後即可讀取該 Profile 記憶。
- 確認後不持續追蹤同一張臉；整段互動只維持一位 `conversation_owner`，直到明確換人或休眠。
- 多人時由訪客口頭指定本次互動歸屬，或選擇「大家一起」的匿名群組模式。
- 網路或 OpenAI 不可用時，不再只顯示錯誤文字；改為播放預先放在 Mac 上的固定特效影片並持續循環。
- Phase 1 不提供訪客主動列出、刪除或管理記憶的指令。自然談話中的更正仍可更新記憶；完整控制延至 Phase 2。
- 移除持續人臉 continuity、identity/write epoch、privacy-grade delete journal、複雜 ACK chain 與重複 Realtime 狀態機。
- 本機 Admin／Developer Console 提升為 Foundation 必做項目，從第一天提供設定、telemetry、模擬與逐 Phase 驗收依據。

## 3. 理想使用體驗

1. 魔鏡處於沉睡畫面，本機 wake-word engine 持續等待自訂中文喚醒詞。
2. 訪客喚醒後，Avatar 立刻播放甦醒動畫，同時建立 OpenAI Realtime 連線。
3. 相機只在喚醒階段短暫查看畫面：
   - 找到可信候選時，魔鏡問：「是 Nova 嗎？」
   - 找不到時，魔鏡詢問稱呼。
   - 有多人時，魔鏡問：「今晚這段對話要記在誰名下？也可以說大家一起。」
4. 訪客口頭確認後，系統載入該 Profile 的近期與穩定記憶；未確認前不載入私人記憶。
5. Avatar 以中文自然交談、允許插話，嘴型依實際播放聲音同步。
6. 完整咒語觸發燈光、煙霧或音樂；一般對話、部分句子或相似語意不觸發。
7. 若訪客明確表示換人，舊 Realtime session 關閉，新的乾淨 session 再確認新主人。
8. 最後一次有效互動完成五分鐘後，系統回到沉睡。

若喚醒後無法連上 OpenAI，或對話途中斷線，系統停止 AI 聲音，改播固定 looping 特效影片。連線恢復後回到 Dormant，等待下一次喚醒。

## 4. 成功定義

Phase 1 完成時，同一套軟體必須在實機完成：

- Mac 自動啟動、沉睡、中文喚醒、自然對話、插話、休眠。
- Avatar 待機、甦醒、傾聽、思考、說話、場景與離線影片狀態。
- 新訪客、回訪候選、口頭確認、多人指定主人、匿名群組與明確換人。
- 保存註冊來源影像，從同一批影像重新建立另一版 embedding 並可切換回舊版。
- 每位賓客的近期／長期記憶與全場域共用 Master Memory。
- Lighting、Fog、Music 三類場景及其 mock／實體 adapter。
- 從 Foundation 開始即可使用的本機 Admin／Developer Console。
- 每個 Phase 都有可重複執行的獨立 demo 與 exit criteria。
- 最終 100 次 lifecycle 與 72 小時長測中沒有黑畫面、無限 queue 或必須人工重啟的卡死。

## 5. 產品原則

### 5.1 Visitor path 優先

錯誤不應變成看不見的 gate：

- Camera 失效：改問名字，對話仍可繼續。
- 記憶抽取失敗：當次對話照常，Console 顯示「未保存」。
- 單一特效失敗：其他對話與效果繼續，Console 顯示哪個 adapter 失敗。
- OpenAI／網路失效：播放固定 looping 特效影片。
- 本機核心檔案或資料庫損壞：顯示 Maintenance 畫面並在 Console 說明原因，不黑畫面。

### 5.2 只保留能解決實際問題的複雜度

Phase 1 不建立：微服務、遠端後臺、Home Assistant、MQTT bus、MCP server、multi-agent graph、向量資料庫、speaker diarization、voiceprint、持續人臉追蹤或通用場景編輯平台。

### 5.3 驗收條件不是執行 gate

Phase exit criteria 用來判斷是否能前進，不表示正式執行時每個模組都必須先通過整套測試才能工作。可降級的功能要清楚降級，不能 silently reject。

## 6. 已確認產品決策

| 項目 | Phase 1 決策 |
|---|---|
| 主控 | Mac mini M4，單機 modular monolith |
| 顯示 | 既有直立 HDMI 單向透視螢幕；不在 PRD scope |
| 對話 | `gpt-realtime-2.1`、OpenAI Agents SDK `RealtimeSession`、WebRTC |
| Voice | OpenAI 內建 Voice；客製 Voice 延至 Phase 2 |
| 語言 | 繁體中文為主，可自然中英混用 |
| Avatar | AI 生成半寫實 2D 素材，Live2D rig |
| 喚醒 | Mac 本機、自訂中文喚醒詞 |
| 插話 | 開啟，由 Realtime／WebRTC 處理 |
| 休眠 | 最後一次有效互動完成 300 秒後；另支援明確「睡吧」 |
| 離線表現 | Wake 仍可用；喚醒後雲端失敗或 Active 中斷時播放本機 looping 特效影片 |
| Profile 權限 | 人臉只提候選；訪客口頭確認後即可載入私人記憶 |
| 多人 | 一次一位 conversation owner，或 anonymous group；不做逐句 speaker attribution |
| 人臉資料 | 保存 5～8 張同意後的註冊來源影像及多版本 embeddings |
| 個人記憶 | 每位賓客獨立；SQLite 是唯一真相來源 |
| 場域記憶 | Master Memory，由本機 Admin 修改 |
| 逐字稿 | 不持久化完整逐字稿或錄音；開發 Console 只可在 RAM 暫時顯示 |
| 訪客記憶控制 | Phase 1 不提供 list／forget／forget-me 等顯式指令；Phase 2 再做 |
| Phase 1 特效 | Lighting、Fog、Music |
| 特效觸發 | 完整 final transcript 與設定咒語正規化後相等 |
| 開發後臺 | Foundation 即提供本機 Admin／Developer Console 與 telemetry |

## 7. 使用者與模式

### 7.1 初次訪客

沒有 Profile。可匿名對話，也可用唯一的「鏡中稱呼」建立 Profile並選擇註冊人臉。

### 7.2 回訪賓客

魔鏡可能從喚醒影像提出候選；對方口頭確認後，系統才讀取其私人記憶。

### 7.3 多人群組

由現場訪客口頭指定一位 conversation owner。若選擇「大家一起」，可完整對話與觸發場景，但不讀寫個人記憶。

### 7.4 主持人／開發者

透過本機 Console 觀察狀態、調整設定、測試模組、瀏覽 Profile／註冊影像、重新產生 embeddings、管理記憶及執行每個 Phase 的驗收。

## 8. Phase 1 User Stories

### US-FOUND-001｜可啟動且不黑畫面的骨架（Must）

身為主持人，我希望 Mac 啟動後魔鏡自行進入可辨識狀態，即使部分模組尚未完成也不會黑畫面。

**驗收：**

- 本機核心正常時進入 Dormant，不以 OpenAI、Camera 或實體 adapter 是否在線作為 Dormant gate。
- 無法顯示主畫面、讀取設定或打開 SQLite 時顯示 Maintenance 畫面與診斷碼。
- 未實作模組在 Console 顯示 `Not implemented`，不能以空白或無回應代替。

### US-DEV-001｜Admin／Developer Console（Must）

身為主持人與開發者，我希望從 Foundation 起就能觀察與操控系統，以便與 Codex／Claude Code逐步協作。

**驗收：**

- Console 是本機第二個 Electron 視窗，可透過快捷鍵或隱藏入口從任何畫面開啟。
- 顯示 app state、build／commit、config version、模組狀態、目前 Profile、Realtime 連線、最近錯誤與 metadata-only event timeline。
- 可模擬 wake、cloud failure、camera result、Avatar state 與 scene result。
- 每個 Phase 都把自己的設定、測試按鈕、telemetry 與最近一次驗收結果接入同一 Console。
- Runtime 的 ignore、fallback 或 failure 都必須產生可見 event；不允許 silent fail。

### US-VOICE-001｜自然中文對話與插話（Must）

身為訪客，我希望魔鏡像一個正在場內的角色，能自然說中文，也能在它說話時打斷。

**驗收：**

- 使用 `gpt-realtime-2.1`、內建 Voice 與 Persona instructions。
- 使用者開始說話後，正在播放的 AI 聲音與嘴型能被中止，接著處理新回合。
- 一般對話不等待 Camera、Memory extractor 或特效完成。
- Console 顯示連線、首音延遲、插話及錯誤事件，不保存完整逐字稿。

### US-WAKE-001｜自訂中文喚醒（Must）

身為訪客，我希望用自訂中文喚醒詞叫醒魔鏡，不需觸碰任何裝置。

**驗收：**

- Dormant 時 wake worker 在 Mac 本機運行，不持續上傳房間音訊。
- Wake 後立即播放甦醒畫面，再建立 Realtime connection。
- Wake worker 與 Realtime 不同時持有麥克風。
- Active 中再次說 wake phrase 視為普通語句。

### US-AV-001｜自然 Avatar（Must）

身為訪客，我希望 Avatar 的嘴型、表情與狀態自然，不像播放互不相關的動畫。

**驗收：**

- 至少支援 Dormant、Waking、Listening、Thinking、Speaking、Scene、Suspending、OfflineLoop。
- 嘴型以實際播放的 AI audio 為時間來源，不以字幕時間猜測。
- 插話或斷線時，AI audio 和嘴型同步停止。
- 有自然眨眼、呼吸、微頭動與平順狀態轉換。

### US-OUTAGE-001｜可見的雲端中斷（Must）

身為主持人，我希望雲端失效時螢幕立刻呈現明確而具魔幻感的訊號，以便知道需要排除問題。

**驗收：**

- 網路／OpenAI 不可用不阻止本機 wake worker 運作。
- 喚醒後連線失敗，或 Active session 中斷時，停止 AI audio並播放預載的固定影片且無縫循環。
- 進入 OfflineLoop 時關閉舊 Realtime session、清除 conversation owner與所有 RAM transcript；恢復後不得續接舊對話。
- Console 同時顯示 failure source、最後錯誤與 retry 狀態。
- 系統定期做輕量連線檢查；恢復後停止影片、回 Dormant，需重新喚醒。
- 可由 Console 手動播放、停止與測試 OfflineLoop。

### US-ID-001｜匿名或新 Profile（Must）

身為初次訪客，我希望不註冊也能對話；如果願意，也能用稱呼建立 Profile。

**驗收：**

- 拒絕建立 Profile 時進入 anonymous，不讀寫個人記憶。
- 建立 Profile 時使用隨機 UUID；`call_name` 在 Phase 1 必須唯一，重名者選不同暱稱。
- 人臉註冊不是繼續對話的前提。
- Profile 建立後可由 Console 查看與修改。

### US-ID-002｜註冊來源影像與可重建 embeddings（Must）

身為同意註冊的賓客，我希望一次拍攝後，系統日後更換辨識模型不必再次要求我拍照。

**驗收：**

- 明確取得口頭同意後，保存 5～8 張不同角度／自然表情的來源影像。
- 每張影像保存 guest UUID、相對路徑、雜湊、拍攝時間、品質分數、face crop metadata 與 consent time。
- Embedding 以 detector＋recognition model 成對記錄（兩者的 model ID／version／檔案雜湊）、preprocess version、dimension 與 source image ID；detector 變更（alignCrop 依其 landmarks）一律視為新 embedding 版本。
- Console 可從同一批影像建立另一版 embeddings；新批次完成前不覆蓋舊版。
- 可切換 active model並回復舊版，不需重新拍攝。
- Runtime recognition frames 不保存。

### US-ID-003｜回訪口頭確認（Must）

身為回訪賓客，我希望魔鏡先問我是不是候選 Profile，再使用我的私人記憶。

**驗收：**

- 喚醒時人臉結果只能提出候選，不能直接載入記憶。
- 候選確認 session 只含 Persona＋Master Memory，不含任何賓客私人資料。
- 候選 Profile ID 由本機程式綁定；模型只判斷下一個完整回答是否明確肯定，不可自行指定另一個 guest ID。
- 確認問題開始播放後，對方可直接回答或插話；明確肯定才設定 conversation owner 並載入該 Profile 記憶。
- 對方否認、回答模糊或沒有可信候選時，最多重問一次，再改問稱呼或匿名繼續。
- 確認後不持續做人臉 identity tracking。

### US-ID-004｜多人與 conversation owner（Must）

身為多人中的訪客，我希望明確知道這場互動算在誰名下，而不是讓系統暗自猜測。

**驗收：**

- 喚醒時偵測到多人，魔鏡詢問本次 conversation owner。
- 指定某位 Profile 後仍需該人口頭確認。
- 選擇「大家一起」時進入 anonymous group，不讀寫私人記憶。
- Owner 確認後，其他人進出畫面不自動切換或中斷對話。
- Phase 1 不宣稱能判斷每句話由哪位訪客說出。

### US-ID-005｜明確換人（Must）

身為訪客，我希望能說「換成小明」或「我是小明」來切換本次互動主人。

**驗收：**

- 只有明確口頭換人流程才改變 owner；Camera 不自動切換。
- 換人時關閉含原 Profile conversation history 的 Realtime session。
- 建立不含私人記憶的乾淨 session，確認新對象後才載入其記憶。
- 新 owner 無法取得前一位 owner 的 Realtime history 或記憶。
- 若取消換人，可在乾淨 session 回到原 owner 或 anonymous，不回用已關閉的 session。

### US-MEM-001｜賓客近期與長期記憶（Must）

身為已確認賓客，我希望魔鏡下次見面能記得近期事件和穩定偏好。

**驗收：**

- 只有已口頭確認的 conversation owner 可讀寫個人記憶。
- 明確自述的穩定偏好／關係形成 durable memory；近期事件形成 recent episode。
- 自然更正（例如「我現在不喝咖啡了」）可取代舊值。
- 每個背景抽取工作固定保存建立當時的 owner profile ID；換人後不能改寫到新 owner。
- 確認、換人、建立 Profile、選擇群組與休眠等控制回合不進個人記憶抽取；若同一句混有新私事，切換完成後由魔鏡自然請對方重述。
- Guest A 的查詢與注入結果不得出現 Guest B 的資料。
- Final transcript 只在 RAM 完成抽取，之後丟棄；DB、backup 與 telemetry 不保存完整逐字稿或音訊。
- Phase 1 不提供訪客 `list／remember／forget／forget_me` 等顯式 memory tools；由 Admin Console 管理資料。

### US-MASTER-001｜招待所 Master Memory（Must）

身為主持人，我希望編輯魔鏡對場域、故事與空間的共同認知。

**驗收：**

- Master Memory 與 Persona 分開管理。
- 只有 Admin Console 可新增、修改、停用或刪除 Master entries。
- 新內容在下一個 Realtime session 生效；正在說話的 session 不被中途改寫。
- Anonymous／group 與具名 Profile 都可使用 Master Memory。

### US-SCENE-001｜完整咒語觸發場景（Must）

身為訪客，我希望說出完整咒語時，Avatar 與實體空間產生一致的魔幻效果。

**驗收：**

- 只有 normalized final transcript 完整等於 normalized spell 才觸發。
- Partial、相似語意、咒語加上否定或其他句子均不觸發。
- 每個 user turn 最多觸發一次。
- Scene 使用具名 presets 與簡單 timeline；LLM 不產生任意 DMX／煙霧參數。
- Adapter failure 產生 Console event，其他對話與未失敗功能繼續。

### US-SCENE-002｜音樂與對話共存（Must）

身為訪客，我希望音樂播放時仍能與魔鏡交談，也能自然停止或淡出。

**驗收：**

- 只播放 Mac 本機核准的曲目／playlist。
- AI 說話時音樂自動降低音量，結束後恢復。
- 支援 play、stop、fade in、fade out。
- 進入 Dormant 或 OfflineLoop 前停止／淡出場景音樂。

### US-IDLE-001｜五分鐘或口頭休眠（Must）

身為訪客，我停止互動後希望魔鏡可靠回到沉睡，也能直接叫它睡下。

**驗收：**

- 最後一次有效 user turn 或 Assistant playback 完成 300 秒後進入 Suspending。
- 噪音、health check、telemetry 與純音樂進度不重設 timer。
- 明確「睡吧」結束當前回覆後進入 Suspending。
- Dormant 前關閉 Realtime、停止 media、清除 active owner 與 RAM transcripts，將 mic 交回 wake worker。

### US-DATA-001｜簡單備份與還原（Must）

身為主持人，我希望單機故障後仍能復原 Profile、註冊影像與記憶。

**驗收：**

- 備份包含 SQLite、設定、註冊來源影像與 face model manifest。
- 可由 Console 手動備份、查看時間並在 Dormant／Maintenance 還原。
- Restore 前驗證 SQLite integrity 與必要影像檔是否存在。
- Admin 刪除 Profile 時刪除 active DB rows 與目前資料目錄；舊 rotating backups 可能保留到輪替淘汰，Phase 1 不宣稱 privacy-grade erasure。

## 9. 功能需求摘要

### 9.1 Foundation 與 Console

- **FR-FOUND-01：** Electron Main 是 app lifecycle、active owner、config 與 module health 的唯一 owner。
- **FR-FOUND-02：** 頂層狀態只包含 Starting、Dormant、Activating、Active、Suspending、OfflineLoop、Maintenance。
- **FR-FOUND-03：** Console 是 overlay／第二視窗，不是另一套 backend 或 lifecycle state。
- **FR-DEV-01：** Telemetry 只保存 timestamp、module、event、status、duration、error code、session ID 和非內容 metadata。
- **FR-DEV-02：** Console 保存最近 Phase smoke test 的版本、時間、結果與備註。
- **FR-DEV-03：** 所有 fallback／drop／failure 都需產生 visitor-visible state 或 Console event。

### 9.2 Voice、Wake 與 Avatar

- **FR-VOICE-01：** 使用官方 Agents SDK `RealtimeSession`＋WebRTC；SDK 負責 VAD、barge-in、播放與 session history。
- **FR-VOICE-02：** App 只以 `sessionGeneration` 忽略已關閉 session 的遲到事件，不複製完整 Realtime 狀態機。
- **FR-WAKE-01：** Wake worker 與 Realtime renderer 透過簡單 release／acquire handshake 交接麥克風。
- **FR-AV-01：** Live2D 嘴型分析實際播放音訊；中止播放同步停止 mouth motion。
- **FR-OUT-01：** OfflineLoop asset 預載於本機，可由任一雲端連線失敗路徑進入。

### 9.3 Identity 與記憶

- **FR-ID-01：** 身分狀態只包含 unassigned、confirming、active、anonymous/group。
- **FR-ID-02：** 人臉只在喚醒／註冊時工作，不作 Active continuous identity monitoring。
- **FR-ID-03：** Profile 改變時先關閉舊 Realtime session，再從乾淨 session 載入新 owner。
- **FR-ID-04：** Enrollment sources 與 embeddings 分開保存；新 embedding batch 完成後才切換 active model。
- **FR-MEM-01：** SQLite 保存 recent、durable 與 Master Memory；不使用外部 memory platform。
- **FR-MEM-02：** 記憶抽取使用支援 Structured Outputs 的 Responses model；Realtime model 不負責嚴格 JSON 寫入。
- **FR-MEM-03：** 每個 extract job 保存 `ownerProfileIdAtTurnStart`，不得在完成時查 current owner。
- **FR-MEM-04：** Phase 1 只由 Admin Console 編輯／停用／刪除記憶。

### 9.4 Scenes

- **FR-SCENE-01：** Spell matcher 是本機 exact matcher，不使用 LLM semantic intent。
- **FR-SCENE-02：** Lighting、Fog、Music 各有一個小型 typed adapter 與 mock。
- **FR-SCENE-03：** Scene timeline 只支援 Phase 1 需要的 cue、delay、preset、cooldown 與 timeout，不建立通用 workflow engine。

### 9.5 記憶架構決策

Phase 1 採用應用程式內建的薄型 `MemoryService`＋SQLite，而不直接導入完整 memory framework。這不是要自行發明通用記憶產品；它只實作本場域確定需要的四件事：按 `guest_id` 隔離、保存近期事件、保存可被自然更正的穩定事實、在新 session 組成少量 context。

| 候選 | 強項 | Phase 1 不採用原因 |
|---|---|---|
| Mem0 | 自動抽取、hybrid／entity retrieval、多種 vector store | 目前資料量不需 vector store；2026 版 extraction／retrieval 仍在快速演進，會增加 migration 與調參面 |
| Letta | Agent-managed memory blocks、archival memory、完整 stateful-agent runtime | 會與 OpenAI Realtime session／Persona owner 重疊；本產品不希望模型自行管理記憶工具 |
| Graphiti／Zep | 雙時間知識圖與複雜關係查詢 | 需要 graph database、embedding 與額外 ingestion；遠超單一招待所的查詢需求 |
| Supermemory | 託管式 profile、extract／recall 與 hybrid search | 會增加另一個雲端依賴與內容傳輸；本地 Console 也較難成為唯一可觀測入口 |
| 薄型 SQLite service | 本機、低延遲、可直接檢查與修改、Profile scope 明確 | 語意搜尋能力有限；需自行寫少量 extract／conflict／context 組裝邏輯 |

若實際資料達到單一 Profile 數百筆以上，或 50 個代表性 recall 測試低於 90%，才建立 ADR 評估 SQLite FTS5／embedding retrieval；不得把這項未發生的需求變成 Phase 1 runtime gate。

## 10. 非功能需求與量測

以下是 Phase exit／field acceptance 指標，不是每次執行都要同步通過的 runtime gate。

| ID | 指標 | 目標 |
|---|---|---:|
| NFR-01 | Wake detected → Waking 首幀 | P95 ≤ 150 ms |
| NFR-02 | Wake detected → Realtime Listening | P95 ≤ 1.5 s（正常網路） |
| NFR-03 | User speech stopped → AI audio onset | P50 ≤ 1.2 s；P95 ≤ 2.5 s |
| NFR-04 | User barge-in → AI audio／嘴型停止 | P95 ≤ 200 ms |
| NFR-05 | AI audio onset → mouth motion | P95 ≤ 80 ms |
| NFR-06 | Avatar rendering | 開發／正式 asset 目標 60 FPS；P95 ≥ 55 FPS |
| NFR-07 | 雲端失敗 → OfflineLoop 首幀 | ≤ 5 s；不得黑畫面或無聲卡住 |
| NFR-08 | 具名 Profile 軟體查詢隔離 | 測試案例中 cross-profile recall = 0 |
| NFR-09 | 100 次完整 lifecycle | 無 deadlock／黑畫面 |
| NFR-10 | 72 小時最終 workload | 無人工重啟、DB corruption、unbounded queue |

## 11. Telemetry 與可觀測性

Console 必須回答五個問題：

1. 現在系統在哪個狀態？
2. 哪個模組最後成功／失敗？
3. 這次變更使用哪個 build、config、模型與資產？
4. 體驗慢在哪一段？
5. 這個 Phase 最近一次驗收是否通過？

### 11.1 持久化 telemetry

- App state transition、module status、duration、error code。
- Realtime connection、首音延遲、interrupt、usage metadata。
- Wake 偵測 metadata（keyword、設定 threshold／boost；KWS 引擎不輸出 per-event confidence）、Camera candidate score、active face model pair（detector＋recognizer）version。
- Avatar FPS、audio underrun。
- Memory extraction success／failure 與 queue depth，不含內容。
- Scene／adapter result。
- Build commit、app version、config version與測試結果。

Telemetry queue、RAM timeline與本機 rotating logs 都必須有固定上限；寫入失敗或 queue 滿時可丟棄最舊診斷事件並增加 counter，但不得阻止訪客對話或特效。

### 11.2 不持久化內容

- 完整 user／assistant transcript。
- 原始對話 audio。
- 完整 private memory context。
- Runtime face frames、embedding vectors。
- OpenAI／Agents SDK 的 model data trace、tool data trace與本機 audio history；正式模式必須明確關閉，而不是依賴套件預設值。

開發時 Console 可在 RAM 顯示最近幾個 final transcripts，方便驗證咒語與記憶抽取；休眠或 app restart 後清除。

## 12. 已接受限制

- Conversation owner 不是 speaker diarization。多人中其他人說話時，系統仍可能把內容視為 owner 的回合。
- 確認後不持續看臉；A 未明確換人就離開、B 直接接手時，Phase 1 無法自動知道。
- 人臉辨識只是方便提出候選，不是強身份驗證；口頭確認就是本產品的授權方式。
- 不保存逐字稿，因此 crash 前尚未完成的記憶抽取可能遺失。
- Exact spell 仍受 transcription 正確度影響；需用實際咒語錄音測試。
- 雲端中斷時只有固定影片，沒有離線 AI 對話。
- Admin 刪除資料不會立即清除所有歷史 rotating backups。

## 13. Phase 2

- 訪客主動查看、修正、刪除或完整忘記自己的記憶。
- 客製 Voice、多 Persona、多 Avatar／Persona Pack。
- 同名 Profile 的進階 alias／disambiguation。
- 只有實測證明需要時，才評估 semantic memory search、voiceprint 或 speaker diarization。

## 14. Implementation Phases

完整 Entry／Build／Demo／Exit／Console／Mock 定義見 `Magic_Mirror_Implementation_Plan_v0.3.md`。

| Phase | 可獨立展示的結果 |
|---|---|
| 0 Foundation | Mirror shell、OfflineLoop、Admin／Developer Console、telemetry、全部 mocks |
| 1 Realtime Voice | 真實中文 speech-to-speech、Persona、插話、斷線進 OfflineLoop |
| 2 Wake Lifecycle | 自訂中文 wake、mic handoff、五分鐘休眠、離線時仍可 wake |
| 3 Avatar／Audio | Live2D states、實際音訊嘴型、music ducking |
| 4 Scenes | 三條咒語、timeline、Lighting／Fog／Music mocks與 adapters |
| 5 Identity／Profiles | 新客／回訪／多人 owner／換人、保存影像、embedding rebuild |
| 6 Memory | Recent／durable／Master Memory、自然更正、Admin editor |
| 7 Field Hardening | 最終硬體／Avatar／Persona、backup、100 cycles、72h soak |

## 15. 場域方尚需提供

| 輸入 | 需要內容 | 建議 |
|---|---|---|
| Persona | 名稱、背景、語氣、禁用語氣、招呼／告別、記憶提起方式 | 一份 1～2 頁 Persona Bible |
| Voice | Phase 1 built-in Voice | 3 個中文聲線 A/B 後選一個 |
| Wake phrase | 主要詞與可接受變體 | 3～6 音節、避開日常高頻句 |
| OfflineLoop | 固定特效影片 | 本機 H.264／H.265，可無縫循環、無需網路 |
| Spells | 每個場景完整咒語 | 先定 3 條不常出現在日常談話的完整句 |
| Scenes | 燈光、煙霧、音樂 cue timing | 先做 3 個代表場景 |
| Avatar | 分層 PSD、Live2D rig、motions／expressions | 先一個角色，不做換裝系統 |
| Hardware | Audio、Camera、DMX／Fog control interface | 依 adapter contract 選型 |

## 16. 硬體建議（非 PRD scope）

### 16.1 建議採購清單

| 優先 | 類別 | 建議採購 | 用途／選擇理由 |
|---:|---|---|---|
| 1 | 主機 | Mac mini M4，建議 24 GB unified memory／512 GB SSD | Live2D、Electron、Wake／Face workers、影像與 72 小時長測仍有餘裕 |
| 1 | Audio PoC | Jabra Speak2 40 USB | 四麥克風、full duplex、AEC，先最快驗證中文 Realtime、wake 和插話 |
| 2 | Camera | Logitech Brio 505 | USB-C、macOS plug-and-play、1080p／30、autofocus；只在喚醒與註冊短暫使用 |
| 3 | 最終隱藏式 Audio | reSpeaker Flex XVF3800 Linear-4，不需 XIAO ESP32S3 | 線性前向收音、可把 mic board 藏在鏡框、USB UAC 2.0、內建 AEC／beamforming／noise suppression |
| 3 | 最終喇叭 | 一對小型 powered speakers，接 reSpeaker 3.5 mm output；或一顆 4 Ω／最高 10 W 喇叭接板上 amplifier | AI voice 與本機音樂共用同一 playback path，讓 AEC 能取得播放 reference |
| 4 | DMX 介面 | ENTTEC DMX USB Pro | macOS 可用、內建 frame buffer；由 Mac 直接控制一個 DMX universe |
| 4 | Lighting | 依視覺需求選 DMX-compatible RGBW／UV fixtures | 同一 DMX bus 執行預設 lighting scenes |
| 4 | Fog | 選原生 DMX control 的 fog machine | 避免另外做 Wi-Fi／relay protocol；與 Lighting 共用 adapter transport |
| 4 | DMX 配件 | 5-pin DMX cables、必要的 3↔5 pin adapter、末端 terminator | 完成單一路徑佈線 |
| — | Voice satellite | **不購買** | 單房、單鏡、單一 Mac；額外 satellite 只會增加音訊與 lifecycle 複雜度 |

既有 HDMI 螢幕／單向透視電視不在本文件範圍。以上型號是 Prototype 建議，不把採購型號寫成軟體 hard dependency；軟體只依 stable device ID 與 adapter contract 綁定。

### 16.2 Audio 採購順序

1. Foundation／Realtime 階段先只買 Jabra Speak2 40，以單一 USB 裝置完成輸入、輸出與 AEC，快速排除應用程式問題。
2. Avatar 穩定後再換 reSpeaker Flex，選 Linear-4，因訪客主要站在鏡子正面；不需要為本案購買 XIAO 或 voice satellite。
3. 最終模式採 reSpeaker 的 USB 48 kHz firmware 候選，AI voice 與 music 都由它的 playback output送至喇叭；Phase 3 Audio Spike 實測 AEC、barge-in與音樂品質後才固定 firmware。
4. 不使用 HDMI 電視喇叭作正式對話輸出，否則 XVF3800 可能拿不到同一路播放 reference，現場回音與插話表現會變得難以預測。

## 17. 2026-08 研究依據

- [OpenAI GPT-Realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- [OpenAI Agents SDK — Building Realtime Agents](https://openai.github.io/openai-agents-js/guides/voice-agents/build/)
- [OpenAI Agents SDK — Realtime transport](https://openai.github.io/openai-agents-js/guides/voice-agents/transport/)
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)
- [OpenAI GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenCV DNN face detection／recognition](https://docs.opencv.org/4.11.0/d0/dd4/tutorial_dnn_face.html)
- [Apple Vision face capture quality](https://developer.apple.com/documentation/Vision/analyzing-a-selfie-and-visualizing-its-content)
- [SQLite](https://www.sqlite.org/)
- [sherpa-onnx custom keyword spotting](https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html)
- [Jabra Speak2 40](https://www.jabra.com/en-gb/business/speakerphones/jabra-speak-series/jabra-speak2-40)
- [Seeed reSpeaker Flex XVF3800](https://wiki.seeedstudio.com/respeaker_flex_introduction/)
- [ENTTEC DMX USB Pro](https://www.enttec.com/product/dmx-usb-interfaces/dmx-usb-pro-professional-1u-usb-to-dmx512-converter/)
- [Logitech Brio 505](https://futureisnow.logitech.com/en-us/products/webcams/brio-505-webcam.html)
- [Mem0 memory architecture](https://docs.mem0.ai/platform/features/graph-memory)
- [Letta memory blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks)
- [Graphiti](https://github.com/getzep/graphiti)
- [Supermemory](https://github.com/supermemoryai/supermemory)
