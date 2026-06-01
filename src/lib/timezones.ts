export const CHINA_REPORT_TIMEZONE = 'Asia/Shanghai';
export const META_ACCOUNT_TIMEZONE = 'Australia/Sydney';

export function timezoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '00';
  const localAsUtc = Date.UTC(
    Number(value('year')),
    Number(value('month')) - 1,
    Number(value('day')),
    Number(value('hour')),
    Number(value('minute')),
    Number(value('second')),
  );
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function localDateHourToIso(dateHour: string, timeZone: string): string | null {
  if (!/^\d{10}$/.test(dateHour)) return null;
  const local = `${dateHour.slice(0, 4)}-${dateHour.slice(4, 6)}-${dateHour.slice(6, 8)}T${dateHour.slice(8, 10)}:00:00`;
  const guess = new Date(`${local}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const first = new Date(`${local}${timezoneOffset(guess, timeZone)}`);
  if (Number.isNaN(first.getTime())) return null;
  return new Date(`${local}${timezoneOffset(first, timeZone)}`).toISOString();
}

export function chinaWindow(hoursAgo = 0) {
  const end = new Date(Date.now() - hoursAgo * 3600000);
  return {
    start: new Date(end.getTime() - 24 * 3600000),
    end,
    timezone: CHINA_REPORT_TIMEZONE,
  };
}
