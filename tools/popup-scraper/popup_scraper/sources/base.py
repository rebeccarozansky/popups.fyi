"""Source adapter base class + shared runtime context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

from ..config import Config
from ..http import HttpClient
from ..models import PopupEvent
from ..timeframe import TimeFrame


@dataclass
class Context:
    """Everything a source needs to do its job, passed in from the CLI."""

    cfg: Config
    http: HttpClient
    timeframe: TimeFrame
    limit_per_source: int
    verbose: bool


class Source:
    """Base class. A source turns config + a time window into PopupEvents.

    Subclasses implement `fetch`. They should:
      - only return events (or leads) relevant to the target city,
      - not crash the whole run on a single bad URL (catch + continue),
      - set `.source` and `.confidence` on every event they emit.
    """

    #: registry key used in config `type:` fields.
    type_name: str = ""

    def __init__(self, urls: List[str], options: dict):
        self.urls = urls
        self.options = options or {}

    def fetch(self, ctx: Context) -> List[PopupEvent]:  # pragma: no cover - abstract
        raise NotImplementedError

    def log(self, ctx: Context, msg: str) -> None:
        if ctx.verbose:
            print(f"    [{self.type_name}] {msg}")
