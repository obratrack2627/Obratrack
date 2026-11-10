require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  civilDay,
  isoDay,
  monday,
  calendarMonths,
  activityDates,
  activityBar,
  scheduleBounds,
} = require("../lib/gantt/timeline.ts");
const activity = (start, end, progress = 0) => ({
  fecha_inicio: start,
  fecha_termino: end,
  porcentaje_avance: progress,
});

test("Gantt acepta fechas civiles reales, incluso bisiestas, sin normalizar fechas inválidas", () => {
  assert.equal(isoDay(civilDay("2028-02-29")), "2028-02-29");
  for (const value of [
    "",
    "2026-02-29",
    "2026-13-01",
    "2026-11-31",
    "2026-11-09T00:00:00Z",
  ])
    assert.equal(civilDay(value), null, value);
  assert.equal(activityDates(activity("2026-11-10", "2026-11-09")), null);
});
test("Gantt dibuja duraciones inclusivas: una partida de un día conserva ancho y posición", () => {
  const start = civilDay("2026-11-02");
  const bar = activityBar(activity("2026-11-09", "2026-11-09", 100), start, 14);
  assert.equal(bar.left, 50);
  assert.ok(Math.abs(bar.width - 100 / 14) < 1e-10);
  assert.equal(bar.fill, 100);
  assert.equal(bar.clipped, false);
  assert.equal(activityDates(activity("2026-11-02", "2026-11-09")).days, 8);
});
test("Gantt conserva el avance real al recortar una partida en ambos bordes del calendario", () => {
  const row = activity("2026-11-01", "2026-11-20", 50);
  assert.deepEqual(activityBar(row, civilDay("2026-11-06"), 10), {
    left: 0,
    width: 100,
    fill: 50,
    clipped: true,
  });
  assert.equal(activityBar(row, civilDay("2026-11-11"), 10).fill, 0);
  assert.equal(activityBar(row, civilDay("2026-11-01"), 5).fill, 100);
  assert.equal(activityBar(row, civilDay("2026-11-21"), 14), null);
  assert.equal(
    activityBar(activity("", "2026-11-20"), civilDay("2026-11-01"), 14),
    null,
  );
});
test("Gantt agrupa meses y años dentro del mismo calendario y alinea las semanas al lunes", () => {
  assert.equal(isoDay(monday(civilDay("2027-01-03"))), "2026-12-28");
  const months = calendarMonths(civilDay("2026-12-28"), 14);
  assert.deepEqual(
    months.map(({ key, start, days }) => ({ key, start, days })),
    [
      { key: "2026-12", start: 0, days: 4 },
      { key: "2027-01", start: 4, days: 10 },
    ],
  );
  assert.deepEqual(
    scheduleBounds([
      activity("2026-11-09", "2026-11-20"),
      activity("2026-11-02", "2026-12-02"),
      activity("", ""),
    ]),
    { start: civilDay("2026-11-02"), end: civilDay("2026-12-02") },
  );
  assert.equal(scheduleBounds([activity("", "")]), null);
});
