from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import queue
import sys
import threading
import time
from typing import Any

_src_dir = Path(__file__).resolve().parents[1]
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

from core.midi import MidiEventNormalizer, MidiListener


def _parse_int(argv: list[str], name: str, default: int) -> int:
    for i, arg in enumerate(argv):
        if arg.startswith(f"{name}="):
            value = arg.split("=", 1)[1].strip()
            try:
                return int(value)
            except ValueError:
                return default
        if arg == name and i + 1 < len(argv):
            try:
                return int(argv[i + 1])
            except ValueError:
                return default
    return default


def _has_flag(argv: list[str], name: str) -> bool:
    return name in argv


def _json_line(obj: dict[str, Any]) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


class MidiEventHub:
    def __init__(self):
        self._lock = threading.Lock()
        self._clients: set[queue.Queue[dict[str, Any]]] = set()
        self._normalizer = MidiEventNormalizer()

    def add_client(self) -> queue.Queue[dict[str, Any]]:
        q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=2048)
        with self._lock:
            self._clients.add(q)
        return q

    def remove_client(self, q: queue.Queue[dict[str, Any]]):
        with self._lock:
            self._clients.discard(q)

    def publish(self, msg: dict[str, Any]):
        with self._lock:
            clients = list(self._clients)
        for q in clients:
            try:
                q.put_nowait(msg)
            except queue.Full:
                continue

    def on_midi_event(self, event, include_all: bool):
        if not include_all and not self._normalizer.is_useful(event.type):
            return
        normalized = self._normalizer.normalize(event)
        self.publish(normalized.to_record())


hub = MidiEventHub()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args):
        return

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(_json_line({"ok": True}))
            return

        if not self.path.startswith("/events"):
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"Not Found")
            return

        q = hub.add_client()
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()

            while True:
                try:
                    msg = q.get(timeout=15.0)
                    payload = json.dumps(msg, ensure_ascii=False).encode("utf-8")
                    self.wfile.write(b"data: " + payload + b"\n\n")
                    self.wfile.flush()
                except queue.Empty:
                    try:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        break
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            hub.remove_client(q)


def main():
    port = _parse_int(sys.argv, "--port", 8766)
    include_all = _has_flag(sys.argv, "--all")
    listener = MidiListener()
    devices = list(listener.list_input_devices())
    if not devices:
        print("未发现MIDI输入设备")
        return
    device = listener.find_first_matching(["SAP200", "MEDELI", "MIDI"])
    if device is None:
        print("未选择到输入设备")
        return

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"SSE服务已启动：http://localhost:{port}/events")
    print(f"设备：{device.name}")
    print(f"事件：{'全部' if include_all else '仅有效'}（可用 --all）")
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    print("开始监听MIDI（如端口被占用会自动重试）")
    while True:
        try:
            for event in listener.iter_events(device.name):
                hub.on_midi_event(event, include_all=include_all)
        except KeyboardInterrupt:
            break
        except Exception as e:
            hub.publish({"type": "status", "level": "error", "message": str(e)})
            print(f"MIDI打开失败，将在1s后重试：{e}")
            time.sleep(1)

    server.shutdown()


if __name__ == "__main__":
    main()
