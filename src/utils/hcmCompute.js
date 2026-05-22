// src/utils/hcmCompute.js
/**
 * Core HCM computation logic.
 * All times are handled in local time strings (HH:MM) or JS Date objects.
 */

const NIGHT_START = 22; // 10 PM
const NIGHT_END = 6;    // 6 AM

/**
 * Parse "HH:MM" string into minutes since midnight
 */
export function parseTime(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Format minutes to "Xh Ym" display
 */
export function formatMinutes(mins) {
  if (!mins || mins <= 0) return "0h 0m";
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}h ${m}m`;
}

/**
 * Format minutes to decimal hours (e.g. 1.5)
 */
export function toDecimalHours(mins) {
  return Math.round((mins / 60) * 100) / 100;
}

/**
 * Get minutes of night differential between two Date objects
 * ND covers 22:00 – 06:00
 */
function getNightDiffMinutes(startDate, endDate) {
  let nd = 0;
  let cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor < end) {
    const hour = cursor.getHours();
    const isNight = hour >= NIGHT_START || hour < NIGHT_END;
    if (isNight) nd++;
    cursor = new Date(cursor.getTime() + 60000); // step 1 minute
  }
  return nd;
}

/**
 * Compute all metrics for a single punch pair.
 * @param {Date} timeIn  - actual punch-in Date
 * @param {Date} timeOut - actual punch-out Date
 * @param {Object} schedule - { start: "09:00", end: "18:00" }
 * @returns {Object} metrics in minutes
 */
export function computePunchMetrics(timeIn, timeOut, schedule) {
  const dayStart = new Date(timeIn);
  const [sh, sm] = schedule.start.split(":").map(Number);
  const [eh, em] = schedule.end.split(":").map(Number);

  // Scheduled start/end as Date objects on the same day as timeIn
  const schedStart = new Date(dayStart);
  schedStart.setHours(sh, sm, 0, 0);

  const schedEnd = new Date(dayStart);
  schedEnd.setHours(eh, em, 0, 0);
  // Handle overnight shifts
  if (schedEnd <= schedStart) schedEnd.setDate(schedEnd.getDate() + 1);

  const scheduledMinutes = (schedEnd - schedStart) / 60000;

  // Late: timeIn > schedStart
  const lateMinutes = Math.max(0, Math.floor((timeIn - schedStart) / 60000));

  // Effective work start (if late, work starts at timeIn; else at schedStart for reg calc)
  const workStart = timeIn > schedStart ? timeIn : schedStart;

  // Undertime: timeOut < schedEnd (left early)
  const undertimeMinutes = Math.max(0, Math.floor((schedEnd - timeOut) / 60000));

  // Effective work end
  const workEnd = timeOut < schedEnd ? timeOut : schedEnd;

  // Regular hours: time worked within scheduled window
  const regularMinutes = Math.max(0, Math.floor((workEnd - workStart) / 60000));

  // Overtime: time worked beyond schedEnd
  const otStart = schedEnd;
  const otEnd = timeOut > schedEnd ? timeOut : schedEnd;
  const otMinutes = Math.max(0, Math.floor((otEnd - otStart) / 60000));

  // Night differential on ALL worked time (including OT)
  const ndMinutes = getNightDiffMinutes(timeIn, timeOut);

  // Total worked
  const totalMinutes = Math.max(0, Math.floor((timeOut - timeIn) / 60000));

  return {
    regularMinutes,
    otMinutes,
    ndMinutes,
    lateMinutes,
    undertimeMinutes,
    totalMinutes,
    scheduledMinutes,
  };
}

/**
 * Summarize an array of punch metrics into a daily total
 */
export function aggregateMetrics(metricsArray) {
  return metricsArray.reduce(
    (acc, m) => ({
      regularMinutes: acc.regularMinutes + m.regularMinutes,
      otMinutes: acc.otMinutes + m.otMinutes,
      ndMinutes: acc.ndMinutes + m.ndMinutes,
      lateMinutes: acc.lateMinutes + m.lateMinutes,
      undertimeMinutes: acc.undertimeMinutes + m.undertimeMinutes,
      totalMinutes: acc.totalMinutes + m.totalMinutes,
    }),
    {
      regularMinutes: 0,
      otMinutes: 0,
      ndMinutes: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      totalMinutes: 0,
    }
  );
}

/**
 * Get "YYYY-MM-DD" date key using LOCAL time (not UTC).
 * toISOString() returns UTC which gives wrong date for
 * Philippines (UTC+8) and any non-UTC timezone.
 */
export function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}
