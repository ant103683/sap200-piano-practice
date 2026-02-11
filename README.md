# SAP200 钢琴练习

基于 MIDI 的钢琴练习小工具，包含随机音符训练与实时输入可视化，适配 SAP200 等电钢设备。

## 功能
- 随机练习：单手/双手训练，正确后自动切换
- 实时输入谱表：MIDI 事件从左到右绘制
- 评分与统计：正确/错误、平均耗时（去极值）、最快/最慢并显示音名
- 范围控制：全局范围与左右手独立范围
- 踏板指示：持续控制踏板状态

## 目录结构
- src/app/main.py：MIDI 监听与检查/采集
- src/app/midi_sse_server.py：SSE 服务，向前端推送 MIDI 事件
- src/ui/views/staff_fall.html：训练 UI 页面
- src/ui/views/staff_fall.js：前端逻辑与渲染
- integrations/vexflow/vexflow.js：谱面渲染库
- bravura-master/：Bravura 字体与资源

## 环境要求
- Python 3
- 可用的 MIDI 输入设备（如 SAP200）

安装依赖：

```bash
pip install -r requirements.txt
```

## 快速开始

1) 启动 SSE 服务（默认 8766 端口）：

```bash
python src/app/midi_sse_server.py
```

需要全量事件时：

```bash
python src/app/midi_sse_server.py --all
```

2) 启动静态页面服务：

```bash
python -m http.server 8000
```

3) 打开页面：

```
http://localhost:8000/src/ui/views/staff_fall.html
```

4) 在页面点击“连接”，状态变为“已连接”后开始练习。

## 训练模式说明
- 双手训练：左右手同时出现音符，两个都按对才进入下一组
- 单手训练：只出现一个音符，按对进入下一组
- 实时单行复用：勾选后实时谱面在同一行循环绘制

## MIDI 检查与采集

检查模式（输出按键与长按判定）：

```bash
python src/app/main.py --check --hold-threshold 0.6
```

采集模式（写入 logs/*.jsonl）：

```bash
python src/app/main.py --capture --capture-prefix midi_capture
```

采集所有事件：

```bash
python src/app/main.py --capture --capture-all
```

## 常见问题
- 未发现 MIDI 输入设备：确认设备已连接并被系统识别
- 未选择到输入设备：代码默认匹配 SAP200/MEDELI/MIDI，如设备名称不同请在 src/app/main.py 与 src/app/midi_sse_server.py 中调整匹配关键字
- 页面无法实时显示：确认 SSE 服务在 8766 端口运行，页面已点击“连接”
