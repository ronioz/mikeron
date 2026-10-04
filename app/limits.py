"""Caps on how often someone can try to sign in, sign up or have a code emailed.

The counts live in memory. That is enough while the app runs as a single
process, as the Dockerfile starts it; several processes would each keep their
own counts, and a restart forgets them.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Hashable

# Past this many keys, forget the ones with nothing recent, so a flood of
# made-up addresses can't grow memory without end.
SWEEP_ABOVE = 10_000


class Limit:
    """At most `count` events per `seconds`, counted separately for each key."""

    def __init__(self, count: int, seconds: float) -> None:
        self.count = count
        self.seconds = seconds
        self._events: dict[Hashable, deque[float]] = {}
        self._lock = threading.Lock()

    def wait(self, key: Hashable) -> int:
        """Seconds until the key may have another event, or 0 if it may now."""
        with self._lock:
            now = time.monotonic()
            events = self._recent(key, now)
            if len(events) < self.count:
                return 0
            return max(1, math.ceil(events[0] + self.seconds - now))

    def add(self, key: Hashable) -> None:
        with self._lock:
            now = time.monotonic()
            if len(self._events) > SWEEP_ABOVE:
                for stale in [k for k in self._events if not self._recent(k, now)]:
                    self._events.pop(stale, None)
            self._events.setdefault(key, deque()).append(now)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()

    def _recent(self, key: Hashable, now: float) -> deque[float]:
        events = self._events.get(key)
        if events is None:
            return deque()
        while events and events[0] <= now - self.seconds:
            events.popleft()
        return events


# Wrong passwords, per address and the network address trying it.
SIGN_IN_FAILURES = Limit(10, 15 * 60)
# New accounts per network address.
SIGN_UPS = Limit(10, 60 * 60)
# Codes emailed to one address, whether or not it has an account, so being
# refused says nothing about who has one.
CODE_EMAILS_PER_MINUTE = Limit(1, 60)
CODE_EMAILS_PER_HOUR = Limit(5, 60 * 60)
# Wrong codes per network address, across all accounts.
CODE_FAILURES = Limit(20, 60 * 60)

ALL = (SIGN_IN_FAILURES, SIGN_UPS, CODE_EMAILS_PER_MINUTE, CODE_EMAILS_PER_HOUR, CODE_FAILURES)
