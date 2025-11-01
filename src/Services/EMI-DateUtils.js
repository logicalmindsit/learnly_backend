// Services/EMI-DateUtils.js - For date calculations

export const getLastDayOfMonth = (date) => {
  console.log("1: getLastDayOfMonth called with date =", date);
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  console.log("2: Last day of month =", result);
  return result;
};

export const getMonthName = (date) => {
  console.log("1: getMonthName called with date =", date);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  console.log("2: Months array ready");
  const result = months[date.getMonth()];
  console.log("3: Month name found =", result);
  return result;
};

export const getNextDueDate = (startDate, dueDay, monthsOffset) => {
  console.log("1: getNextDueDate called with:", { startDate, dueDay, monthsOffset });
  const nextDate = new Date(startDate);
  console.log("2: Initial nextDate =", nextDate);

  nextDate.setMonth(nextDate.getMonth() + monthsOffset);
  console.log("3: nextDate after adding monthsOffset =", nextDate);

  const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  console.log("4: Last day of target month =", lastDay);

  const adjustedDay = Math.min(dueDay, lastDay);
  console.log("5: Adjusted day =", adjustedDay);

  const result = new Date(nextDate.getFullYear(), nextDate.getMonth(), adjustedDay);
  console.log("6: Final calculated due date =", result);

  return result;
};

export const getMonthNameFromDate = (date) => {
  console.log("1: getMonthNameFromDate called with date =", date);
  const result = getMonthName(date);
  console.log("2: Result from getMonthName =", result);
  return result;
};
