// South African Public Holidays
// Includes national holidays for leave calculation purposes
// Note: Variable holidays (Easter, Christmas) are included for 2026

module.exports = {
  // Fixed holidays (same date every year)
  fixedHolidays: [
    { month: 0, day: 1, name: "New Year's Day" },
    { month: 2, day: 21, name: "Human Rights Day" },
    { month: 3, day: 27, name: "Freedom Day" },
    { month: 4, day: 1, name: "Workers' Day" },
    { month: 5, day: 16, name: "Youth Day" },
    { month: 7, day: 9, name: "National Women's Day" },
    { month: 8, day: 24, name: "Heritage Day" },
    { month: 11, day: 16, name: "Day of Reconciliation" },
    { month: 11, day: 25, name: "Christmas Day" },
    { month: 11, day: 26, name: "Day of Goodwill" }
  ],

  // Variable holidays (change each year based on Easter)
  // For 2026
  variableHolidays2026: [
    { date: new Date(2026, 3, 10), name: "Good Friday" },
    { date: new Date(2026, 3, 13), name: "Easter Monday" },
    { date: new Date(2026, 3, 27), name: "Freedom Day observed" } // If falls on weekend
  ],

  // Get all holidays for a specific year
  getHolidaysForYear(year) {
    const holidays = [];

    // Add fixed holidays
    this.fixedHolidays.forEach(holiday => {
      const date = new Date(year, holiday.month, holiday.day);
      holidays.push(date);
    });

    // Add variable holidays for specific years
    if (year === 2026) {
      this.variableHolidays2026.forEach(holiday => {
        holidays.push(holiday.date);
      });
    }
    // Add more years as needed
    else if (year === 2027) {
      holidays.push(
        new Date(2027, 3, 2),  // Good Friday
        new Date(2027, 3, 5)   // Easter Monday
      );
    }
    else if (year === 2025) {
      holidays.push(
        new Date(2025, 3, 18), // Good Friday
        new Date(2025, 3, 21)  // Easter Monday
      );
    }

    return holidays;
  },

  // Check if a date is a public holiday
  isPublicHoliday(date) {
    const year = date.getFullYear();
    const holidays = this.getHolidaysForYear(year);

    return holidays.some(holiday => {
      return (
        holiday.getFullYear() === date.getFullYear() &&
        holiday.getMonth() === date.getMonth() &&
        holiday.getDate() === date.getDate()
      );
    });
  },

  // Check if a date is a weekend
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  },

  // Check if a date is a working day (not weekend and not holiday)
  isWorkingDay(date) {
    return !this.isWeekend(date) && !this.isPublicHoliday(date);
  },

  // Get all holidays for a year as date strings
  getHolidayStrings(year) {
    const holidays = this.getHolidaysForYear(year);
    return holidays.map(h => h.toISOString().split('T')[0]);
  }
};
