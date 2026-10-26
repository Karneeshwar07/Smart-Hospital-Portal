/**
 * 10-Minute Granular Time Slot Utilities for Doctor Appointment Booking
 * Standard sessions:
 *  - Morning: 09:00 AM to 12:00 PM (18 slots of 10 mins each)
 *  - Afternoon: 02:00 PM to 05:00 PM (18 slots of 10 mins each)
 *  - Evening: 05:30 PM to 07:30 PM (12 slots of 10 mins each)
 */

export const generate10MinSlots = (startHour, startMin, endHour, endMin) => {
  const slots = [];
  let cur = startHour * 60 + startMin;
  const end = endHour * 60 + endMin;

  while (cur < end) {
    const next = cur + 10;

    const formatTime = (mins, withPeriod = true) => {
      let h = Math.floor(mins / 60);
      const m = mins % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      const hStr = h < 10 ? `0${h}` : `${h}`;
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return withPeriod ? `${hStr}:${mStr} ${ampm}` : `${hStr}:${mStr}`;
    };

    const startPeriod = Math.floor(cur / 60) >= 12 ? 'PM' : 'AM';
    const endPeriod = Math.floor(next / 60) >= 12 ? 'PM' : 'AM';

    // Format: "10:00 - 10:10 AM" if same period, or "11:50 AM - 12:00 PM" if period transition
    let slotLabel = '';
    if (startPeriod === endPeriod) {
      slotLabel = `${formatTime(cur, false)} - ${formatTime(next, true)}`;
    } else {
      slotLabel = `${formatTime(cur, true)} - ${formatTime(next, true)}`;
    }

    slots.push(slotLabel);
    cur = next;
  }
  return slots;
};

export const MORNING_SLOTS = generate10MinSlots(9, 0, 12, 0); // 09:00 AM - 12:00 PM (18 slots)
export const AFTERNOON_SLOTS = generate10MinSlots(14, 0, 17, 0); // 02:00 PM - 05:00 PM (18 slots)
export const EVENING_SLOTS = generate10MinSlots(17, 30, 19, 30); // 05:30 PM - 07:30 PM (12 slots)

export const ALL_10MIN_SLOTS = [
  ...MORNING_SLOTS,
  ...AFTERNOON_SLOTS,
  ...EVENING_SLOTS
];

/**
 * Normalize slot string for accurate conflict detection
 */
export const normalizeSlot = (slot) => {
  if (!slot) return '';
  return String(slot).trim().toLowerCase().replace(/\s+/g, ' ');
};

/**
 * Check if two slot representations conflict
 */
export const isSlotConflict = (slotA, slotB) => {
  const normA = normalizeSlot(slotA);
  const normB = normalizeSlot(slotB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Handle prefix matching (e.g. legacy "10:00 AM" vs "10:00 - 10:10 AM")
  const startA = normA.split('-')[0].trim();
  const startB = normB.split('-')[0].trim();
  if (startA && startB && startA === startB) return true;

  return false;
};

/**
 * Parse start and end minutes from slot label string
 * Supports:
 *  - "09:00 - 09:10 AM"
 *  - "11:50 AM - 12:00 PM"
 *  - "10:00 AM" (legacy)
 *  - "14:00 - 14:10" (24h)
 */
export const parseSlotTimes = (slotStr) => {
  if (!slotStr) return null;
  const str = String(slotStr).trim();

  // Case 1: Time range
  const rangeMatch = str.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (rangeMatch) {
    let [, startH, startM, startPeriod, endH, endM, endPeriod] = rangeMatch;
    startH = parseInt(startH, 10);
    startM = parseInt(startM, 10);
    endH = parseInt(endH, 10);
    endM = parseInt(endM, 10);

    const resolvedEndPeriod = (endPeriod || startPeriod || 'AM').toUpperCase();
    const resolvedStartPeriod = (startPeriod || resolvedEndPeriod).toUpperCase();

    let startHours24 = startH % 12;
    if (resolvedStartPeriod === 'PM') startHours24 += 12;

    let endHours24 = endH % 12;
    if (resolvedEndPeriod === 'PM') endHours24 += 12;

    return {
      startMinutes: startHours24 * 60 + startM,
      endMinutes: endHours24 * 60 + endM
    };
  }

  // Case 2: Single time
  const singleMatch = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (singleMatch) {
    let [, h, m, period] = singleMatch;
    h = parseInt(h, 10);
    m = parseInt(m, 10);
    const p = (period || 'AM').toUpperCase();
    let hours24 = h % 12;
    if (p === 'PM') hours24 += 12;
    const startMinutes = hours24 * 60 + m;
    return {
      startMinutes,
      endMinutes: startMinutes + 10
    };
  }

  return null;
};

/**
 * Returns Date object of slot start time in local system timezone
 */
export const getSlotStartDateTime = (slotStr, dateStr) => {
  if (!slotStr || !dateStr) return null;
  const targetDateOnly = typeof dateStr === 'string' ? dateStr.split('T')[0] : new Date(dateStr).toISOString().split('T')[0];
  const parsed = parseSlotTimes(slotStr);
  if (!parsed) return null;

  const [y, m, d] = targetDateOnly.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(parsed.startMinutes / 60), parsed.startMinutes % 60, 0, 0);
};

/**
 * Check if a time slot has already passed against real-time system clock (Date.now())
 */
export const isSlotPast = (slotStr, dateStr, nowTimestamp = Date.now()) => {
  if (!slotStr || !dateStr) return false;

  const targetDateOnly = typeof dateStr === 'string' ? dateStr.split('T')[0] : new Date(dateStr).toISOString().split('T')[0];
  const now = new Date(nowTimestamp);
  const nowYear = now.getFullYear();
  const nowMonth = String(now.getMonth() + 1).padStart(2, '0');
  const nowDay = String(now.getDate()).padStart(2, '0');
  const todayDateOnly = `${nowYear}-${nowMonth}-${nowDay}`;

  // If appointment date is before today, it has already passed
  if (targetDateOnly < todayDateOnly) return true;

  // If appointment date is after today, it is in the future
  if (targetDateOnly > todayDateOnly) return false;

  // For today's date, compare slot start time with current real-time clock
  const slotDate = getSlotStartDateTime(slotStr, targetDateOnly);
  if (!slotDate) return false;

  return slotDate.getTime() <= now.getTime();
};

export const isPastSlotForDate = isSlotPast;

export const isSlotMatch = (slotA, slotB) => {
  if (!slotA || !slotB) return false;
  return normalizeSlot(slotA) === normalizeSlot(slotB);
};

/**
 * Filter list of slots to only those strictly after current date/time
 */
export const filterFutureSlots = (slots = [], dateStr, nowTimestamp = Date.now()) => {
  return slots.filter((slot) => !isSlotPast(slot, dateStr, nowTimestamp));
};

/**
 * Find the next available future slot that isn't booked and hasn't passed
 */
export const getNextAvailableFutureSlot = (
  slots = ALL_10MIN_SLOTS,
  dateStr,
  bookedSlots = [],
  nowTimestamp = Date.now()
) => {
  return slots.find((slot) => {
    const isBooked = bookedSlots.some((b) => isSlotMatch(b, slot));
    const isPassed = isSlotPast(slot, dateStr, nowTimestamp);
    return !isBooked && !isPassed;
  }) || null;
};

export default {
  MORNING_SLOTS,
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  ALL_10MIN_SLOTS,
  generate10MinSlots,
  normalizeSlot,
  isSlotConflict,
  isSlotMatch,
  parseSlotTimes,
  getSlotStartDateTime,
  isSlotPast,
  isPastSlotForDate,
  filterFutureSlots,
  getNextAvailableFutureSlot
};
