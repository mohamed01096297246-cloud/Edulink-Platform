// The week/month an admin report is looking at, kept as one anchor date
// (YYYY-MM-DD) that the server turns into the actual window. A week runs
// Saturday to Friday on the server; the label shows the school days.

const pad = (n) => String(n).padStart(2, "0");

export const toIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = () => toIsoDate(new Date());

export const shiftPeriod = (iso, period, step) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = period === "month" ? new Date(y, m - 1 + step, 1) : new Date(y, m - 1, d + 7 * step);
  return toIsoDate(date);
};

const dayMonth = (d) => d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", timeZone: "UTC" });

// Server window → "الأسبوع من ٢٧ سبتمبر إلى ١ أكتوبر" or "سبتمبر ٢٠٢٦".
export const periodLabel = (period, start) => {
  if (!start) return "";
  const s = new Date(start);
  if (period === "month") {
    return s.toLocaleDateString("ar-EG", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const sunday = new Date(s.getTime() + 24 * 3600 * 1000);
  const thursday = new Date(s.getTime() + 5 * 24 * 3600 * 1000);
  return `الأسبوع من ${dayMonth(sunday)} إلى ${dayMonth(thursday)}`;
};

export const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }) : "—";

// "منذ ٣ أيام" — for the last time a teacher recorded anything.
export const sinceLabel = (value) => {
  if (!value) return "ولا مرة";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / (24 * 3600 * 1000));
  if (days <= 0) return "النهارده";
  if (days === 1) return "امبارح";
  if (days < 7) return `من ${days.toLocaleString("ar-EG")} أيام`;
  return `يوم ${shortDate(value)}`;
};
