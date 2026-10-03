// The week or month an admin report covers. Teachers pick a week by its
// start date (the app offers the Sunday, but any day can be typed), so a
// week here runs Saturday to Friday: the Saturday, Sunday or Monday a
// teacher might give as the start of one school week all land in the same
// one. Dates are UTC midnights, as marks and attendance store them.

const DAY = 24 * 60 * 60 * 1000;

const utcDay = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

// The Saturday on or before a date — the key every week is grouped by.
const weekKey = (value) => {
  const d = utcDay(value);
  if (!d) return null;
  const back = (d.getUTCDay() + 1) % 7; // Saturday → 0, Sunday → 1, … Friday → 6
  return new Date(d.getTime() - back * DAY);
};

const endOfDay = (d) => new Date(d.getTime() + DAY - 1);

// `period` is "week" or "month"; `date` any day inside it (YYYY-MM-DD),
// today when left out. Returns the window and the weeks inside it that have
// begun by today — the ones a teacher could have recorded already.
const reportPeriod = (period, date) => {
  const anchor = utcDay(date) || utcDay();
  const today = utcDay();

  let start;
  let end;
  if (period === "month") {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    end = endOfDay(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)));
  } else {
    start = weekKey(anchor);
    end = endOfDay(new Date(start.getTime() + 6 * DAY));
  }

  // A month's weeks are those whose Sunday falls inside it, since that is
  // the date the app hands a teacher as the week's start.
  const weeks = [];
  for (let sat = weekKey(start); sat <= end; sat = new Date(sat.getTime() + 7 * DAY)) {
    const sunday = new Date(sat.getTime() + DAY);
    const counts = period === "month" ? sunday >= start && sunday <= end : true;
    if (counts && sat <= today) weeks.push(sat);
  }

  return { period: period === "month" ? "month" : "week", start, end, weeks };
};

module.exports = { reportPeriod, weekKey, utcDay };
