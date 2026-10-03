import threading, time
from collections import defaultdict
from contextlib import contextmanager


class StageTimer:
  def __init__(self):
    self.lock = threading.Lock()
    self.seconds = defaultdict(float)
    self.calls = defaultdict(int)

  @contextmanager
  def time(self, stage):
    began = time.perf_counter()
    try:
      yield
    finally:
      with self.lock:
        self.seconds[stage] += time.perf_counter() - began
        self.calls[stage] += 1

  def iterate(self, stage, iterable):
    iterator = iter(iterable)
    while True:
      try:
        with self.time(stage):
          item = next(iterator)
      except StopIteration:
        return
      yield item

  def report(self):
    lines = [f"  {stage:<22}{self.seconds[stage]:>8.1f}s{self.calls[stage]:>7} calls{self.seconds[stage] / self.calls[stage] * 1000:>9.0f} ms/call" for stage in sorted(self.seconds)]
    return "\n".join(lines)


timer = StageTimer()
