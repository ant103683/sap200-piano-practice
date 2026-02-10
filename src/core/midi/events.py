from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass(frozen=True)
class MidiMessageEvent:
    timestamp: datetime
    type: str
    channel: Optional[int]
    note: Optional[int]
    velocity: Optional[int]
    control: Optional[int]
    value: Optional[int]
    data: Optional[dict[str, Any]] = None

