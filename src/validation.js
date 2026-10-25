export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function text(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    fail(400, `${label} is required and must be at most ${maximum} characters.`);
  }
  return value.trim();
}

export function email(value) {
  const result = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(400, 'Enter a valid email address.');
  return result;
}

export function password(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    fail(400, 'Password must have 10-128 characters.');
  }
  return value;
}

export function number(value, label, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
      (integer && !Number.isInteger(value))) {
    fail(400, `${label} must be ${integer ? 'an integer ' : ''}from ${min} to ${max}.`);
  }
  return value;
}

export function recordId(value) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, 'Invalid record ID.');
  return Number(value);
}

export function paintingId(value) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(value)) fail(400, 'Invalid painting ID.');
  return value;
}

// Use UTC midnight only as an integer day counter, never as the local clock.
export function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Use a valid YYYY-MM-DD date.');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    fail(400, 'Use a real calendar date.');
  }
  return timestamp / 86400000;
}

export function kolkataToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function dateAway(value, today, min, max = Infinity) {
  const days = calendarDay(value) - calendarDay(today);
  if (days < min || days > max) {
    fail(400, max === Infinity ? `Date must be at least ${min} calendar days away.` :
      `Date must be ${min}-${max} calendar days away (inclusive).`);
  }
  return value;
}
