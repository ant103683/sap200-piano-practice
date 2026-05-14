# 第 1 期设计：时间轴与双手乐谱骨架

## 目标

第 1 期只解决三个最核心的问题：

1. 项目如何表达一段“按时间展开的乐谱”
2. 左手和右手如何在同一首曲子里同时存在
3. 运行时如何把“当前应该按的音”和“当前实际按住的音”放到同一个坐标系里

这一期不追求完整评分，也不把匹配规则定死。目标是先搭出后续可演化的数据骨架。

## 设计原则

- 乐谱真相和演奏真相分开存储
- 时间以乐谱 tick 为主，真实毫秒时间为辅
- 内部结构支持左右手同时存在
- 运行时按需计算，不预先把整首曲子展开成巨大的逐格数组
- 先支持固定拍号 `4/4` 和固定段落时长，例如“4 拍 = 8 秒”

## 时间模型

建议统一使用 `tick` 作为乐谱时间单位。

- 初始方案：`1 拍 = 32 tick`
- 则 `4/4` 小节 = `128 tick`
- 如果后续遇到三连音、Swing 或更细颗粒度需求，再升级到更高分辨率

需要同时保留一个简单的时间换算器：

- `measureDurationMs`
- `beatDurationMs`
- `tickDurationMs`

在固定速度下：

- `beatDurationMs = measureDurationMs / 4`
- `tickDurationMs = beatDurationMs / 32`

如果后续支持变速，再把它升级为 tempo map。

## 乐谱对象

第 1 期建议先落以下对象：

### `ScoreNote`

表示目标乐谱中的一个音。

建议字段：

- `id`
- `pitch`
- `hand`
- `staff`
- `voice`
- `startTick`
- `durationTick`
- `endTick`
- `measureIndex`
- `tieGroupId`
- `slurGroupId`
- `articulation`

说明：

- `hand` 建议直接保留，取值先用 `left` / `right`
- `staff` 和 `hand` 不完全等价，但第 1 期可以先默认：
  - `left -> bass`
  - `right -> treble`
- 以后如果遇到左右手交叉演奏，再允许二者分离

### `ScoreSong`

表示一段待练习的完整乐谱片段。

建议字段：

- `id`
- `title`
- `timeSignature`
- `ticksPerBeat`
- `measureDurationMs`
- `notes`
- `meta`

其中 `notes` 为 `ScoreNote[]`。

## 演奏对象

### `PerformanceEvent`

保留原始输入事实。

建议字段：

- `id`
- `sessionId`
- `timestampMs`
- `tickEstimate`
- `eventType`
- `pitch`
- `velocity`
- `channel`
- `deviceId`
- `control`
- `value`

### `PerformedNote`

把 `note_on` / `note_off` 归并后形成的实际音符区间。

建议字段：

- `id`
- `sessionId`
- `pitch`
- `handGuess`
- `startMs`
- `endMs`
- `durationMs`
- `startTickEstimate`
- `endTickEstimate`
- `velocityOn`
- `triggerEventId`
- `releaseEventId`
- `isClosed`

说明：

- `handGuess` 第 1 期只做弱推断，默认按音高区间猜测
- 最终判定时优先看是否匹配到左手谱或右手谱，不依赖纯音高猜手

## 运行时对象

### `PracticeSession`

建议字段：

- `id`
- `scoreSongId`
- `startedAtMs`
- `currentTick`
- `isPlaying`
- `activePressedNotes`
- `performedNotes`
- `events`

### `ActivePressedNote`

表示当前仍处于按下态的键。

建议字段：

- `pitch`
- `pressedAtMs`
- `velocityOn`
- `channel`
- `deviceId`
- `sustainedByPedal`

## 左右手设计

左右手必须从数据层就存在，不要等到 UI 阶段再拆。

第 1 期约定：

- 一首曲子里的目标音符必须显式标注 `hand`
- 左右手分别维护各自的目标音符集合
- 同一时刻的“期望按键集合”也按手拆分：
  - `expectedLeftPitches`
  - `expectedRightPitches`
- 当前实际按住集合可以暂时不强制按手拆开，但判定时要尝试归属

这样做的好处：

- 后续可以分别显示左右手练习进度
- 可以支持单手练、双手练、左右手分段练
- 以后遇到同音不同手的复杂情况，也不会推翻结构

## 第 1 期 UI 目标

第 1 期不做复杂评分界面，只做“结构可验证”的最小展示：

- 一段固定 `4/4` 乐谱能被录入
- 能显示双谱表中的左右手目标音符
- 点击开始后，内部 `currentTick` 能持续推进
- 某一时刻可以查询：
  - 当前应该按哪些音
  - 当前实际按住哪些音

## 暂不定死的部分

以下问题先不在第 1 期完全拍板：

- 同一目标音如何匹配多个实际片段
- 连音线如何评分
- 踏板如何改变有效持续时间
- 同音跨小节时 UI 是否直接合并显示

这些先在任务清单中标记为 TODO，边实现边收敛。
