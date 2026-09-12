export const DISPLAY_TIME_ZONE = 'Asia/Seoul';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: DISPLAY_TIME_ZONE
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeZone: DISPLAY_TIME_ZONE
});

const filenameFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: DISPLAY_TIME_ZONE
});

function toValidDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatKoreanDateTime(value, fallback = '') {
  const date = toValidDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatKoreanDate(value, fallback = '') {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function getKoreanDateTimeParts(value) {
  const date = toValidDate(value);
  if (!date) return null;
  const parts = Object.fromEntries(filenameFormatter.formatToParts(date)
    .filter(part => ['year', 'month', 'day', 'hour', 'minute'].includes(part.type))
    .map(part => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  };
}
