import re
from dataclasses import dataclass

QUALS = "Quals"
DOUBLE_ELIM = "DoubleElim"
PRACTICE = "Practice"
FIELD_MATCH = "FieldMatch"
FIELD_FINALS = "FieldFinals"
FINALS_EVENT_LEVELS = (FIELD_MATCH, FIELD_FINALS)
LABEL_PATTERNS = [
  (QUALS, re.compile(r"Qualification\s+(\d+)(?:\s+of\s+(\d+))?", re.IGNORECASE)),
  (DOUBLE_ELIM, re.compile(r"Playoff\s+Match\s+(\d+)", re.IGNORECASE)),
  (PRACTICE, re.compile(r"Practice\s+(\d+)(?:\s+of\s+(\d+))?", re.IGNORECASE)),
  (FIELD_FINALS, re.compile(r"da\s+Vinci\s+Finals\s+(\d+)", re.IGNORECASE)),
  (FIELD_MATCH, re.compile(r"da\s+Vinci\s+Match\s+(\d+)", re.IGNORECASE)),
]
SEMIS_LEVEL_VALUE = 1
DOUBLE_ELIM_LEVEL_VALUE = 2
LEVEL_ID_FACTOR = 10000
SERIES_ID_FACTOR = 1000


@dataclass(frozen=True)
class LabelContext:
  is_finals_event: bool = False
  finals_series: int | None = None


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


def match_id(parsed, context):
  if parsed.level == QUALS:
    return parsed.number
  if parsed.level == FIELD_FINALS:
    if context.finals_series is None:
      return None
    return DOUBLE_ELIM_LEVEL_VALUE * LEVEL_ID_FACTOR + context.finals_series * SERIES_ID_FACTOR + parsed.number
  return DOUBLE_ELIM_LEVEL_VALUE * LEVEL_ID_FACTOR + parsed.number * SERIES_ID_FACTOR + 1


def describe_match_id(match_id):
  if match_id < LEVEL_ID_FACTOR * SEMIS_LEVEL_VALUE:
    return f"Q-{match_id}"
  if match_id < LEVEL_ID_FACTOR * DOUBLE_ELIM_LEVEL_VALUE:
    series, number = divmod(match_id - LEVEL_ID_FACTOR * SEMIS_LEVEL_VALUE, SERIES_ID_FACTOR)
    return f"SF{series}-{number}"
  series, number = divmod(match_id - LEVEL_ID_FACTOR * DOUBLE_ELIM_LEVEL_VALUE, SERIES_ID_FACTOR)
  if series == 0:
    return f"F-{number}"
  return f"M-{series}" if number == 1 else f"M-{series}.{number}"


def resolve_label(text, context=LabelContext()):
  parsed = parse_label(text)
  if not parsed:
    return "unparsed", None, None
  if parsed.level == PRACTICE:
    return "practice", None, None
  if parsed.level != QUALS and (parsed.level in FINALS_EVENT_LEVELS) != context.is_finals_event:
    return "wrong_kind", None, None
  resolved_id = match_id(parsed, context)
  if resolved_id is None:
    return "unparsed", None, None
  return "ok", resolved_id, describe_match_id(resolved_id)
