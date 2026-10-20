# Avatar 感知驗收與 runtime QA

本頁用於「修正動作／表情後，確認畫面真的可辨識」的任務。它補足
bundle validator、參數存在檢查和 drawable delta 不能證明的內容。它不會把
產品對話、音訊、喚醒或 Magic Mirror 產品 QA 加入預設 Avatar 完成門檻。

## 證據層級

每個結論在 job 裡標記實際層級：

- `static`：讀取 model3、motion、expression、參數與引用；只能指出缺件和
  設計風險。
- `synthetic-harness`：只測 harness 程式、合成影像或固定 fixture；不能代表
  真實模型。
- `actual-runtime`：使用專案現有 Core/Framework 載入這次輸出的實際 model
  root，保存參數、drawable、PNG 與版本證據。
- `visual-human`：人在預定顯示尺寸查看實際畫面、filmstrip 和合成背景。
- `visual-agent`：執行 agent 實際查看上述畫面並記錄具體觀察。這可作為本次
  製作的視覺檢查，但不能冒稱使用者或另一位人類已驗收；使用者的美感接受度
  另記 `not_run`，除非使用者已給回饋。

缺少較高層級證據時，使用 `not_run`、`unknown` 或 `blocked`，不能把前一層
升級成通過。每個 job 必須根據當次實際產物填寫已完成和未完成的 evidence；
不要沿用另一個 job 的 runtime 狀態，也不要把 static、synthetic 或舊版模型的
結果寫成這次角色的 actual-runtime／visual-human pass。

## 必要 capture matrix

使用 isolated Core + Framework harness，路徑以參數指定，不要硬編碼某一個舊
runtime：

1. 保存 `ParamAngleX=0` 的 45° neutral，並對照使用者原圖。
2. 沿 `ParamAngleX` 連續取樣，例如 `-30,-24,-18,-12,-6,0,+6,+12,+18,+24,+30`。
   負端點是正面候選時，必須檢查頭部輪廓、眼線、眼窩、喙根與頸部一起轉動。
   整顆頭的 opacity crossfade、只把喙推出去、雙喙、四眼或中途 ghost 都失敗。
3. 保存 Y/Z min、0、max；Y 要改變臉與頸部關係，Z 要有可辨識的 roll。
4. 保存 gaze 的完整九格；瞳孔在極值仍須看得見並留在正確眼窩內。
   黑色眼窩加上一點高光不等於瞳孔保留。單軸可用最大幅度，斜向通常需要
   較小的位移；完成自動合成四角後單獨修角，不要再合成覆蓋修正。
5. 在正面候選端保存 `turn + blink`、`turn + EyeSmile`、`turn + gaze`、
   `turn + beak-open` 和綜合狀態，確認新 overlay 沒有漏到 neutral。
6. 在 45° 與正面候選兩種姿勢檢查嘴巴 closed、half、open；黑、白、checker
   背景都要看。嘴洞必須是 alpha 透明或明確的內腔素材，不能只因 RGB 很黑就算
   透明，也不能只測單一 endpoint。
7. 每個 motion 與 expression 保存 neutral → state 的 timeline、strongest frame
   與 neutral-after。五個 expression 必須真的可辨識，EyeSmile 要與 blink 和
   neutral 不同；七個 motion 不能只是同一個微小曲線換檔名。

## 說明與時間軸自我查核

- 讀實際曲線並看完整淡入後的畫面，才給動作／表情命名。把可見動作和情緒意圖
  分開寫；Body 參數不自動代表收肩、前傾或接近鏡頭，EyeSmile 不自動代表友善。
  頭與身的傾斜方向須依同時刻的曲線與畫面核對，不能只套用名稱。
- 不均勻的 sample time 必須用相鄰時間差推進；另記 SDK clock 的實際 elapsed。
  Expression 至少取一幀超過該檔 FadeInTime。未設定時核對當前 Framework 預設，
  不能假設 0.9 秒已完成。禁止每次固定 tick(0.1) 卻標成 0.25、0.5、0.9 秒。
- `resetToNeutral` 後的 neutral-after 只證明硬重設成功。自然完成、淡出與循環銜接
  必須在不 reset 的 timeline 上另外取樣；不要把兩種證據混用。
- 單獨表情、單獨 motion、實際產品搭配是三種測試。讀目前產品如何選 expression，
  檢查共享參數相加是否 clamp：不同曲線被壓到同一極值時，會失去可見差異。
  若程式屬另一個 session，將根因、可實作修法和指定驗證寫入交接 MD。
- EyeOpen 的 Add 負偏移會延長夾到 0 的閉眼區間；Multiply 可按比例保留 blink
  波形，Overwrite 會接管底層眼開度。這是選擇而非一律判錯；以角色意圖和實際
  眨眼組合決定。參考 [官方表情混合說明](https://docs.live2d.com/en/cubism-sdk-manual/expression/)。
- 若兩個表情仍相似，要直接記錄具體相似之處；不能只改名稱就宣稱視覺區辨改善。
  agent 看過圖片只記 visual-agent，使用者尚未評價則 visual-human 為 not_run。
- 瞇眼的強度要和 gaze 一起調整。在 neutral 可見瞳孔，不代表斜向極值仍清楚；
  若極值只剩高光，先減少表情閉眼程度，再檢查三種轉頭姿勢的九格 gaze。
  不應用寫死 gaze 的表情掩蓋問題，否則會干擾未來追蹤。
- 比較兩張 RGBA 圖是否完全相同時，使用全部 RGBA bytes 或明確包含 RGB 的差異。
  Pillow 的 difference image 若只按 alpha 求 bbox，可能漏掉 alpha 不變的 RGB
  變化，不能把這種空 bbox 宣稱為畫面完全一致。

截圖與分析要同時保存 native canvas 和預定 Magic Mirror 顯示尺寸的版本。display
delta、alpha IoU、drawable vertex delta、component count 都只是排序和找異常
的提示，沒有通用的綠燈閾值。判斷轉頭方向、人物身份、雙特徵、瞳孔、嘴洞及
美觀時，報告必須保留 `UNKNOWN_REQUIRES_HUMAN`。

這個標記用於自動分析欄位；另列 agent 實際看過哪些檔案、看到什麼、是否仍有
缺陷，不把自動欄位直接改成 human pass。確認 HTML canvas 的實際 `width`、
`height` 與 PNG 尺寸；只改瀏覽器 viewport 或 CSS 不代表模型畫布已改，也不應
用 CSS 拉伸製造 native 比例證據。每輪先跑剛改的局部矩陣；通過後才跑完整矩陣。

最終 runtime 的 moc、atlas、cdi、physics 要來自同一次 Editor 匯出。保留自訂
model3 的動作、表情及 EyeBlink/LipSync group；有兩眼時檢查兩個 EyeOpen ID 都
在 EyeBlink group。最終驗證記錄檔案 hash，不能把舊 moc 加新 motion 當成新 rig。

## 交付 evidence

至少保存：

- actual model root、model3／moc3／texture hash、Core 與 moc version；
- `capture-matrix.json`，包含每幀實際 parameter values 與 drawable snapshot；
- head X continuous filmstrip、Y/Z/gaze endpoints、front combined filmstrip；
- 每個 motion／expression 的 timeline filmstrip、strongest frame、neutral-after；
- 嘴巴在兩種姿勢、三種背景的合成圖及 frame-by-frame alpha metrics；
- `human-review-checklist.md`，逐項記錄 reviewer、尺寸、日期和失敗檔名。

完成條件仍分開記錄：`static`、`actual-runtime`、`visual-human`、
`avatar-import-display`。官方示範 Avatar、舊版模型、Viewer 或 synthetic
fixture 不能代替這次角色的實際模型畫面。
