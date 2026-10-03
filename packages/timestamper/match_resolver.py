import re
from dataclasses import dataclass

QUALS = "Quals"
DOUBLE_ELIM = "DoubleElim"
PRACTICE = "Practice"
LABEL_PATTERNS = [
  (QUALS, re.compile(r"Qualification\s+(\d+)(?:\s+of\s+(\d+))?", re.IGNORECASE)),
  (DOUBLE_ELIM, re.compile(r"Playoff\s+Match\s+(\d+)", re.IGNORECASE)),
  (PRACTICE, re.compile(r"Practice\s+(\d+)(?:\s+of\s+(\d+))?", re.IGNORECASE)),
]
DOUBLE_ELIM_LEVEL_VALUE = 2
LEVEL_ID_FACTOR = 10000
SERIES_ID_FACTOR = 1000


@dataclass(frozen=True)
class ParsedLabel:
  level: str
  number: int
  total: int | None


def parse_label(text):
  for level, pattern in LABEL_PATTERNS:
    found = pattern.search(text)
    if found:
      total = found.group(2) if pattern.groups > 1 else None
      return ParsedLabel(level, int(found.group(1)), int(total) if total else None)
  return None


def match_id(parsed):
  if parsed.level == QUALS:
    return parsed.number
  return DOUBLE_ELIM_LEVEL_VALUE * LEVEL_ID_FACTOR + parsed.number * SERIES_ID_FACTOR + 1


def match_description(parsed):
  return f"Q-{parsed.number}" if parsed.level == QUALS else f"M-{parsed.number}"


def resolve_label(text):
  parsed = parse_label(text)
  if not parsed:
    return "unparsed", None, None
  if parsed.level == PRACTICE:
    return "practice", None, None
  return "ok", match_id(parsed), match_description(parsed)
