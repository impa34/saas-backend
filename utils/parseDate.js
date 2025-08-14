// utils/dateParser.js
import * as chrono from "chrono-node";

export function parseDate(text, durationMinutes = 60, bufferMinutes = 10) {
  const parsed = chrono.es.parseDate(text);
  if (!parsed) return null;

  const start = new Date(parsed);
  const end   = new Date(start.getTime() + (durationMinutes + bufferMinutes) * 60 * 1000);

  return { start, end };
}
