from datetime import datetime
import json
from pathlib import Path
import sys

_src_dir = Path(__file__).resolve().parents[1]
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

from core.midi import MidiEventNormalizer, MidiListener


def _parse_hold_threshold(argv: list[str]) -> float:
    for i, arg in enumerate(argv):
        if arg.startswith("--hold-threshold="):
            value = arg.split("=", 1)[1].strip()
            try:
                return float(value)
            except ValueError:
                return 0.6
        if arg == "--hold-threshold" and i + 1 < len(argv):
            try:
                return float(argv[i + 1])
            except ValueError:
                return 0.6
    return 0.6


def _parse_capture_prefix(argv: list[str]) -> str:
    for i, arg in enumerate(argv):
        if arg.startswith("--capture-prefix="):
            value = arg.split("=", 1)[1].strip()
            return value or "midi_capture"
        if arg == "--capture-prefix" and i + 1 < len(argv):
            value = argv[i + 1].strip()
            return value or "midi_capture"
    return "midi_capture"


def _has_flag(argv: list[str], name: str) -> bool:
    return name in argv


def main():
    listener = MidiListener()
    devices = list(listener.list_input_devices())
    if not devices:
        print("未发现MIDI输入设备")
        return
    print("可用MIDI输入设备：")
    for d in devices:
        print(f"- {d.name}")
    device = listener.find_first_matching(["SAP200", "MEDELI", "MIDI"])
    if device is None:
        print("未选择到输入设备")
        return
    print(f"开始监听：{device.name}")
    check_mode = _has_flag(sys.argv, "--check")
    capture_mode = _has_flag(sys.argv, "--capture")
    capture_all = _has_flag(sys.argv, "--capture-all")
    hold_threshold_s = _parse_hold_threshold(sys.argv)
    capture_prefix = _parse_capture_prefix(sys.argv)
    log_handle = None
    capture_handle = None
    if check_mode:
        root_dir = Path(__file__).resolve().parents[2]
        logs_dir = root_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = logs_dir / f"midi_check_{timestamp}.log"
        log_handle = log_file.open("a", encoding="utf-8")
        print(f"检查模式已开启，日志：{log_file}")
        print(f"长按阈值：{hold_threshold_s:.3f}s（可用 --hold-threshold 设定）")
    if capture_mode:
        root_dir = Path(__file__).resolve().parents[2]
        logs_dir = root_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        capture_file = logs_dir / f"{capture_prefix}_{timestamp}.jsonl"
        capture_handle = capture_file.open("a", encoding="utf-8")
        print(f"采集模式已开启，日志：{capture_file}")
        print(f"采集范围：{'全部事件' if capture_all else '仅有效事件（过滤clock等）'}（可用 --capture-all 切换）")
    capture_count = 0
    check_count = 0
    last_ts: datetime | None = None
    capture_normalizer = MidiEventNormalizer()
    check_normalizer = MidiEventNormalizer()

    def write_capture(record: dict):
        if not capture_handle:
            return
        capture_handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        capture_handle.flush()

    def compact(record: dict) -> dict:
        return {k: v for k, v in record.items() if v is not None and v != {} and v != []}

    try:
        for event in listener.iter_events(device.name):
            if capture_mode:
                if not capture_all and not capture_normalizer.is_useful(event.type):
                    continue
                dt_ms = None
                if last_ts is not None:
                    dt_ms = int((event.timestamp - last_ts).total_seconds() * 1000)
                last_ts = event.timestamp
                normalized = capture_normalizer.normalize(
                    event,
                    hold_threshold_s=hold_threshold_s,
                    include_data=True,
                    include_cc_name=True,
                )
                record = normalized.to_record()
                record["i"] = capture_count + 1
                record["dt_ms"] = dt_ms
                write_capture(compact(record))
                capture_count += 1

                if not check_mode:
                    continue

            if check_mode:
                normalized = check_normalizer.normalize(event, hold_threshold_s=hold_threshold_s)
                if (
                    normalized.edge == "down"
                    and normalized.note is not None
                    and normalized.velocity
                    and normalized.velocity > 0
                ):
                    check_count += 1
                    line = (
                        f"{check_count:02d} down note={normalized.note} velocity={normalized.velocity} "
                        f"channel={normalized.channel} t={normalized.timestamp.isoformat(timespec='milliseconds')}"
                    )
                    print(line)
                    if log_handle:
                        log_handle.write(line + "\n")
                        log_handle.flush()
                elif (
                    normalized.edge == "up"
                    and normalized.note is not None
                    and normalized.hold_ms is not None
                ):
                    check_count += 1
                    line = (
                        f"{check_count:02d} up note={normalized.note} channel={normalized.channel} "
                        f"hold_ms={normalized.hold_ms} long={1 if normalized.long else 0} "
                        f"down_velocity={normalized.down_velocity} t={normalized.timestamp.isoformat(timespec='milliseconds')}"
                    )
                    print(line)
                    if log_handle:
                        log_handle.write(line + "\n")
                        log_handle.flush()
            else:
                if event.type in {"note_on", "note_off"}:
                    print(f"{event.type} note={event.note} velocity={event.velocity} channel={event.channel}")
                else:
                    print(f"{event.type} channel={event.channel} value={event.value}")
    finally:
        if log_handle:
            log_handle.close()
        if capture_handle:
            capture_handle.close()


if __name__ == "__main__":
    main()
