from dataclasses import dataclass


@dataclass(frozen=True)
class MidiDeviceInfo:
    name: str

