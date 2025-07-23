// Utils/EMI-DateUtils.js - For date calculations
export const getLastDayOfMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

export const getNextDueDate = (startDate, dueDay, monthsOffset) => {
  const nextDate = new Date(startDate);
  nextDate.setMonth(nextDate.getMonth() + monthsOffset);
  const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  const adjustedDay = Math.min(dueDay, lastDay);
  return new Date(nextDate.getFullYear(), nextDate.getMonth(), adjustedDay);
};

