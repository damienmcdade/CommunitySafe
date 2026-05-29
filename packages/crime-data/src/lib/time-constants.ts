/// v96p2 — shared time-window constants. Five modules (trend-feed,
/// upticks, mix, safety-score, dispatcher) each declared their own
/// `MS_PER_DAY = 24 * 60 * 60 * 1000` or `DAY = …` — the quality
/// audit flagged the duplication. Centralizing here so future
/// window-math changes touch one file instead of five and so
/// reviewers see the magic-number policy in a single place.

export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;
