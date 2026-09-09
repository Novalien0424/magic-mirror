# 渡鴉大人：保留版本

2026-09-09，依使用者要求只保留 v7、v8 與最新版 v10。版本清理不修改模型內容或產品程式。

| 版本 | 可編輯交付目錄 | Console managed ID |
|---|---|---|
| v7 | [raven-lord](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord) | model-93ccc318-06ff-417f-a301-557ae7eaac2d |
| v8 | [raven-lord-v08](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v08) | model-9c968fa4-5e14-4fb5-b2af-fad0c4d3cf1b |
| v10／最新 | [專案 Raven/v10](resources/avatar/Raven/v10)（[索引及備份政策](resources/avatar/Raven/README.md)） | model-d5fef684-d4c0-4140-afdf-72f149076b95 |

v10 完整交付已於 2026-09-09 複製到專案並逐檔驗證；原 Codex outputs
副本仍保留。v7／v8 路徑不變，沒有因本次專案歸檔新增或刪除 managed 模型。

Console 版本標籤（2026-09-09）：三個現存 managed 模型的 17 個引用檔案
各自核對原始版本後，已由 UI 儲存為 `Raven · v7`、`Raven · v8`、
`Raven · v10`。Name／Version 存在各自 `avatar-label.json`，不改 rig 或
發布草稿；往後可在 Live2D Cubism 頁編輯並儲存。[操作與驗證](docs/testing/avatar-library-labels-2026-09-09.md)。

三版 runtime、CMO、PSD／來源圖共 129 個檔案，在本機版本清理前後 SHA-256 相同。v10 的 canonical CMO 名稱仍為 raven-lord-v09.cmo3，因 v10 只改表情；它是最新版必需的來源，已保留。v7 製作所用的早期來源素材亦不按檔名盲刪。

已刪除 v9 獨立交付目錄、runtime／complete ZIP、v9 rollback ZIP 目錄及暫存 runtime。v7、v8、v10 的交付 ZIP，以及 v7／v8 回復包保留。

v9 的 QA 圖片與紀錄移至 [歷史查核資料](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/work/raven-lord-v10/prior-v09-qa)，用於保留 +30 喙部及表情疊加問題的證據。歷史文件中的 v9 模型／ZIP 路徑不再可用；請用此表選擇保留版本。

[本機清理明細與驗證](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-avatar-cleanup.json)。最新程式修法及表情說明見 [v10 交接文件](C:/Project/magic-mirror/RAVEN-V10-EXPRESSION-FIX-HANDOFF.md)。

Console library 已刪除 v9 與舊 v7 重複匯入，刷新後僅列三個 Raven；內建 Ren 保留。草稿只移除未使用 duplicate 的 avatarCatalog.models 登錄，未切換角色或發布草稿；active／previous 檔案核對未變。三個 managed 模型共 51 檔與對應交付 SHA 相符。[Library 驗證](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-avatar-cleanup-library.json)。
