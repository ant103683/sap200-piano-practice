from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .events import MidiMessageEvent

USEFUL_MIDI_TYPES = {
    "note_on",
    "note_off",
    "control_change",
    "pitchwheel",
    "aftertouch",
    "polytouch",
    "program_change",
    "sysex",
    "start",
    "stop",
    "continue",
    "songpos",
    "song_select",
}

CC_NAMES = {
    1: "mod_wheel",
    2: "breath",
    4: "foot_controller",
    7: "channel_volume",
    10: "pan",
    11: "expression",
    64: "sustain",
    66: "sostenuto",
    67: "soft_pedal",
}


@dataclass(frozen=True)
class UnifiedMidiEvent:
    timestamp: datetime
    type: str
    channel: int | None
    note: int | None
    velocity: int | None
    control: int | None
    value: int | None
    edge: str | None = None
    hold_ms: int | None = None
    sustain: bool | None = None
    pitch: int | None = None
    program: int | None = None
    pressure: int | None = None
    cc_name: str | None = None
    down_velocity: int | None = None
    long: bool | None = None
    data: dict[str, Any] | None = None

    def to_record(self, *, include_none: bool = False) -> dict[str, Any]:
        record: dict[str, Any] = {
            "t": self.timestamp.isoformat(timespec="milliseconds"),
            "type": self.type,
            "channel": self.channel,
            "note": self.note,
            "velocity": self.velocity,
            "control": self.control,
            "value": self.value,
            "edge": self.edge,
            "hold_ms": self.hold_ms,
            "sustain": self.sustain,
            "pitch": self.pitch,
            "program": self.program,
            "pressure": self.pressure,
            "cc_name": self.cc_name,
            "down_velocity": self.down_velocity,
            "long": self.long,
            "data": self.data,
        }
        if include_none:
            return record
        return {k: v for k, v in record.items() if v is not None}


class MidiEventNormalizer:
    def __init__(self):
        self._active_notes: dict[tuple[int | None, int | None], tuple[datetime, int | None]] = {}

    @staticmethod
    def is_useful(event_type: str) -> bool:
        return event_type in USEFUL_MIDI_TYPES

    def normalize(
        self,
        event: MidiMessageEvent,
        *,
        hold_threshold_s: float | None = None,
        include_data: bool = False,
        include_cc_name: bool = False,
    ) -> UnifiedMidiEvent:
        data = event.data or {}
        edge: str | None = None
        hold_ms: int | None = None
        is_long: bool | None = None
        down_velocity: int | None = None
        sustain: bool | None = None

        if event.type == "control_change" and event.control == 64:
            sustain = True if (event.value or 0) >= 64 else False

        if event.type == "note_on" and (event.velocity or 0) > 0:
            key = (event.channel, event.note)
            self._active_notes[key] = (event.timestamp, event.velocity)
            edge = "down"
        elif event.type in {"note_off", "note_on"} and (
            event.type == "note_off" or event.velocity == 0
        ):
            key = (event.channel, event.note)
            start = self._active_notes.pop(key, None)
            edge = "up"
            if start is not None:
                start_ts, start_velocity = start
                duration_s = (event.timestamp - start_ts).total_seconds()
                hold_ms = int(duration_s * 1000)
                down_velocity = start_velocity
                if hold_threshold_s is not None:
                    is_long = duration_s >= hold_threshold_s

        cc_name = None
        if include_cc_name and event.type == "control_change":
            cc_name = CC_NAMES.get(event.control)

        return UnifiedMidiEvent(
            timestamp=event.timestamp,
            type=event.type,
            channel=event.channel,
            note=event.note,
            velocity=event.velocity,
            control=event.control,
            value=event.value,
            edge=edge,
            hold_ms=hold_ms,
            sustain=sustain,
            pitch=data.get("pitch"),
            program=data.get("program"),
            pressure=data.get("pressure"),
            cc_name=cc_name,
            down_velocity=down_velocity,
            long=is_long,
            data=data if include_data else None,
        )
