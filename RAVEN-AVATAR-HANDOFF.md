# 渡鴉大人 — v10 handoff

正式專案副本（2026-09-09）：[Raven 資產索引](resources/avatar/Raven/README.md)、
[v10 匯入入口](resources/avatar/Raven/v10/runtime/raven-lord.model3.json)。
完整 runtime、CMO、PSD／來源與 QA 已複製並逐檔驗證。下方 Codex outputs
連結保留為原始交付紀錄；後續匯入／交接優先使用專案副本，既有 managed ID 不變。

2026-09-09。v10 已在現有 Windows Console 匯入並正常顯示，最後 Stop/reset 停在 45°。

- **請先讀：[v10 修改、七動作／五表情、QA 與完整程式交接](C:/Project/magic-mirror/RAVEN-V10-EXPRESSION-FIX-HANDOFF.md)。**
- 只改 exp_05：移除附加笑眼，EyeOpen 改 Multiply 0.85，定位為「謹慎打量／保留態度」。其餘 16 個 runtime 檔及 rig、貼圖沿用 v09。
- 35 幀表情時間取樣、27 gaze＋15 blink 組合完成；neutral 及其他四表情與 v09 的 RGBA bytes 相同。Console 實際預覽 exp_01／05；17 managed 檔 SHA 相符。
- 新 Console ID：`model-d5fef684-d4c0-4140-afdf-72f149076b95`，畫面尾碼 `49076b95`。
- [v10 model3](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10/runtime/raven-lord.model3.json)、[runtime ZIP](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10-runtime.zip)、[完整可編輯包](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v10-complete.zip)。依使用者最新要求只保留 v7／v8／v10，v9 獨立模型與備份已清理；見 [保留版本索引](C:/Project/magic-mirror/RAVEN-AVATAR-VERSIONS.md)。
- **仍待 coding session**：state 自動表情採 face-only 衍生版本，保留 v10 Multiply。完整姿態 expression＋motion 仍可能把轉頭夾到上限；本次沒有改產品 code。完整表情手動預覽保留。
- v09 固定構圖及 +30 喙部修正未變。極端斜向 gaze 仍有部分虹膜遮擋，不宣稱所有極值美感已通過；人類驗收未做。
- 未發布 Appearance 草稿、未切換主 Mirror、未改產品設定／語音／SDK。Skill 與 QA 操作陷阱已更新並保存快照。
