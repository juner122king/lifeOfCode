const {
  DAYS_PER_MONTH,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  WEEKDAY_NAMES,
  WORLD_START_MINUTES
} = require("./constants");

function normalizeWorldTimeMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : WORLD_START_MINUTES;
}

function getWorldCalendar(worldTimeMinutes = WORLD_START_MINUTES) {
  const totalMinutes = normalizeWorldTimeMinutes(worldTimeMinutes);
  const dayIndex = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = totalMinutes % MINUTES_PER_DAY;
  const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
  const dayOfYear = dayIndex % DAYS_PER_YEAR + 1;
  const month = Math.floor((dayOfYear - 1) / DAYS_PER_MONTH) + 1;
  const dayOfMonth = (dayOfYear - 1) % DAYS_PER_MONTH + 1;
  const weekOfMonth = Math.floor((dayOfMonth - 1) / DAYS_PER_WEEK) + 1;
  const weekdayIndex = (dayOfMonth - 1) % DAYS_PER_WEEK;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return {
    totalMinutes,
    dayIndex,
    day: dayIndex + 1,
    year,
    month,
    weekOfMonth,
    weekdayIndex,
    weekday: WEEKDAY_NAMES[weekdayIndex],
    hour,
    minute,
    hhmm,
    full: `第${year}年 ${month}月 第${weekOfMonth}周 ${WEEKDAY_NAMES[weekdayIndex]} 第${dayIndex + 1}天 ${hhmm}`,
    short: `Y${year} M${String(month).padStart(2, "0")} W${weekOfMonth} ${WEEKDAY_NAMES[weekdayIndex]} D${String(dayIndex + 1).padStart(3, "0")} ${hhmm}`
  };
}

function formatWorldCalendar(state, style = "full") {
  const calendar = getWorldCalendar(state.worldTimeMinutes);
  return style === "short" ? calendar.short : calendar.full;
}

module.exports = {
  formatWorldCalendar,
  getWorldCalendar,
  normalizeWorldTimeMinutes
};
