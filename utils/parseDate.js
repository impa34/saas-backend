// utils/dateParser.js
import * as chrono from "chrono-node";

export function parseDate(text) {
  const parsed = chrono.es.parseDate(text);           // reconoce “mañana a las 14”
  const start = new Date(parsed);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // 1 h por defecto
  return { start, end };
}
