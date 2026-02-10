from datetime import datetime
from typing import Iterable, Optional

import mido

from .device import MidiDeviceInfo
from .events import MidiMessageEvent


class MidiListener:
    def list_input_devices(self) -> Iterable[MidiDeviceInfo]:
        return [MidiDeviceInfo(name=n) for n in mido.get_input_names()]

    def open_input(self, device_name: str):
        return mido.open_input(device_name)

    def iter_events(self, device_name: str):
        with self.open_input(device_name) as inport:
            for msg in inport:
                yield self._to_event(msg)

    def _to_event(self, msg) -> MidiMessageEvent:
        return MidiMessageEvent(
            timestamp=datetime.now(),
            type=msg.type,
            channel=getattr(msg, "channel", None),
            note=getattr(msg, "note", None),
            velocity=getattr(msg, "velocity", None),
            control=getattr(msg, "control", None),
            value=getattr(msg, "value", None),
            data=msg.dict(),
        )

    def find_first_matching(self, keywords: Iterable[str]) -> Optional[MidiDeviceInfo]:
        candidates = [d for d in self.list_input_devices()]
        if not candidates:
            return None
        keywords_upper = [k.upper() for k in keywords]
        for device in candidates:
            name_upper = device.name.upper()
            if any(k in name_upper for k in keywords_upper):
                return device
        return candidates[0]
