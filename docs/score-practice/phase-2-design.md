# 第 2 期设计：判定引擎与进度条反馈

## 目标

第 2 期解决“练习体验”的主体问题：

1. 如何把目标音符和实际演奏进行初版匹配
2. 如何显示每个音符的持续进度
3. 如何把左右手的判定结果清晰地展示出来

这一期可以接受判定规则不完美，但必须可解释、可观察、可迭代。

## 判定核心思路

第 2 期建议按“目标音符为中心”来判定。

即：

- 每个 `ScoreNote` 产生一个 `JudgmentResult`
- 它内部记录匹配到的一个或多个 `PerformedNote`
- 结果以“覆盖率”和“分段情况”为主，不只给一个对错布尔值

## 判定对象

### `JudgmentResult`

建议字段：

- `id`
- `sessionId`
- `scoreNoteId`
- `hand`
- `matchedPerformedNoteIds`
- `status`
- `pitchMatched`
- `timingStartDeltaMs`
- `timingEndDeltaMs`
- `coverageRatio`
- `continuousHoldRatio`
- `gapCount`
- `earlyRelease`
- `latePress`
- `overHold`
- `errorSegments`
- `feedbackTags`

### `ErrorSegment`

用于支撑你想要的“体温计式进度条”。

建议字段：

- `startTickOffset`
- `endTickOffset`
- `segmentType`
- `relatedPerformedNoteId`

初始 `segmentType`：

- `correct_hold`
- `missing`
- `late_start_gap`
- `early_release_gap`
- `wrong_pitch`
- `extra_hold`

## 进度条视图

每个目标音显示为一条细长条：

- 底色表示目标时值范围
- 绿色表示正确按住的区间
- 橙色表示偏差区间
- 红色表示错误音或明显干扰

关键要求：

- 同音延音目标在视觉上合并成一条连续长条
- 中间断开时必须能看见断点
- 左右手分区域显示，避免视觉混乱

## 左右手 UI 方案

建议至少有两个同步视图：

### 1. 正式谱面视图

- 保留双谱表
- 左手在低音谱号
- 右手在高音谱号
- 当前播放位置有统一的时间游标

### 2. 练习判定视图

- 以音高为纵轴，时间为横轴
- 或以目标音列表为纵轴，时间片段为横向进度条
- 左右手分区显示

推荐第 2 期先用“按目标音列表渲染的细进度条”，实现成本低于完整 piano-roll。

## 第 2 期匹配规则

先定一版够用的弱规则，后续可替换：

### 初版匹配建议

- 只在同音高内寻找候选 `PerformedNote`
- 优先匹配时间窗最接近目标区间的候选
- 一个目标音优先匹配一个实际音
- 如果实际音只覆盖了一部分，允许再补一个候选片段
- 最多先允许匹配 2 个片段，避免算法复杂度失控

### 左右手归属建议

- 先按目标乐谱的 `hand` 归属
- 如果同一音高同时存在左右手目标音：
  - 优先按时间最近原则匹配
  - 仍无法区分时标记“歧义”

### 误按建议

- 如果实际音无法归属任何目标音：
  - 生成 `ExtraNoteJudgment`
- 如果实际音落在休止区：
  - 明确标记为错误

## 不在第 2 期强求的内容

- 连音线的高级评分
- 复杂踏板逻辑
- 多声部独立判定
- 装饰音和倚音

这些保留到第 3 期。
