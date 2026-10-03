# 渡鴉大人 — v09 handoff

2026-09-08。v09 已修正 +30 左側喙部裁切，正常匯入並顯示於既有 Console 預覽。

- **最新自我查核與待實作程式修法**：[動作／表情自我查核](C:/Project/magic-mirror/RAVEN-V09-MOTION-EXPRESSION-SELF-AUDIT.md)。已修正表情 QA 時間及不準確說明；確認 Thinking + exp_05 會將 HeadX 的 26／20／28 全夾成 30。建議 state 自動表情只寫臉部，保留完整姿態供獨立預覽。程式尚未修改，交由 Coding Session 處理。
- [完整構圖修法、七動作、五表情、QA 與回復方式](C:/Project/magic-mirror/RAVEN-V09-BEAK-FIX-AND-MOTION-DESIGN.md)。
- [匯入 model3](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09/runtime/raven-lord.model3.json)；完整 17 runtime 檔一起使用。
- [可編輯 CMO](C:/Users/b8901/Documents/Codex/2026-09-07/new-chat/outputs/raven-lord-v09/cubism/raven-lord-v09.cmo3)；4 份 Photopea PSD 與 JSON 動作／表情皆保存。
- 新 managed ID：`model-8cb13e76-a05d-4b20-afc4-1b116c8524dd`；17 檔與交付完全一致。
- v09 資產只改 Warp2 +30 頭部 keyform，並在角色 model3 加 `Layout={height:1.9,x:0.17,y:-0.05}`。保留 95% 尺寸，固定構圖；構圖部分不需再改 app code。動作／表情疊加是另一個已交接的程式問題，見上方最新文件。
- 579 個組合抽樣的頭部 ROI 最小左餘量 28 px；真正 Console +30 亦已確認。後側羽毛與肩部在極端右傾時仍會被直式邊緣裁到，不宣稱全部輪廓通過。
- 七 motions／五 expressions 曲線沿用放大後 v08。本次新增 35 幀完整淡入表情與 17 幀局部 Core 檢查。exp_01／exp_05 仍較相似，不宣稱五情緒都可一眼辨認。Speaking 只提供頭身節奏，MouthOpenY 仍由 lip-sync 驅動。
- Console Stop/reset 留在正常 45°。未發布現有草稿、未切換主 Mirror、未修改產品 code／設定／語音／SDK；產品 session 保有整合責任。
- v08 原版與逐檔驗證 rollback ZIP 保留；路徑與方法見完整文件。
