// Leave balance utility functions
// Rules:
// 1. Beginning of year: 1.5 leave days
// 2. End of year: 18 leave days
// 3. Accrual: 16.5 days over 365 days (0.0452 days per calendar day)
// 4. If insufficient balance, leave becomes unpaid
// 5. Only working days count (exclude weekends and SA holidays)

const db = require('../db');
const saHolidays = require('./saHolidays');

/**
 * Calculate accrued leave days for a specific date
 * Rule: 1.5 days at Jan 31, 3 days by Feb 28, 18 days by Dec 31
 * Stepped accrual:
 * - Jan 1-31: 1.5 days (base)
 * - Feb 1-28: 1.5 to 3 days (0.0536 per day)
 * - Mar 1-Dec 31: 3 to 18 days (0.0492 per day)
 * @param {Date} date - The date to calculate accrued days for
 * @returns {number} - Accrued days (rounded to 2 decimals)
 */
function calculateAccruedLeaveDays(date = new Date()) {
  const year = date.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const februaryEnd = new Date(year, 1, 28); // Feb 28
  const marchStart = new Date(year, 2, 1); // Mar 1
  
  let accruedDays = 1.5; // Base days
  
  if (date > februaryEnd) {
    // Past Feb 28: accrue from 3 to 18 days over Mar 1 to Dec 31
    // That's 305 days to accrue 15 days = 0.0492 per day
    const daysIntoMarch = Math.floor((date - marchStart) / (1000 * 60 * 60 * 24));
    const marchRate = 15 / 305; // 0.0492
    accruedDays = 3.0 + (daysIntoMarch * marchRate);
    accruedDays = Math.min(accruedDays, 18.0); // Cap at 18
  } else if (date > new Date(year, 0, 31)) {
    // In February: accrue from 1.5 to 3 days over Feb 1 to Feb 28
    // That's 28 days to accrue 1.5 days = 0.0536 per day
    const februaryStart = new Date(year, 1, 1); // Feb 1
    const daysInFebruary = Math.floor((date - februaryStart) / (1000 * 60 * 60 * 24));
    const februaryRate = 1.5 / 28; // 0.0536
    accruedDays = 1.5 + (daysInFebruary * februaryRate);
    accruedDays = Math.min(accruedDays, 3.0); // Cap at 3
  }
  // else: before/on Jan 31, stay at 1.5 days
  
  return Math.round(accruedDays * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate the number of working days between two dates
 * Excludes weekends and South African public holidays
 * @param {string|Date} startDate 
 * @param {string|Date} endDate 
 * @returns {number} - Number of working days
 */
function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Ensure start is before or equal to end
  if (start > end) {
    return 0;
  }
  
  // Count working days including both start and end dates
  let workingDays = 0;
  const currentDate = new Date(start);
  
  while (currentDate <= end) {
    if (saHolidays.isWorkingDay(currentDate)) {
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return Math.max(workingDays, 0);
}

/**
 * Get or create leave balance for an employee for a specific year
 * @param {number} employeeId 
 * @param {number} year 
 * @returns {Promise<object>} - Leave balance record
 */
async function getLeaveBalance(employeeId, year = new Date().getFullYear()) {
  try {
    // Try to get existing balance
    let result = await db.query(
      `SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2`,
      [employeeId, year]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    // Create new balance record if it doesn't exist
    const accruedDays = calculateAccruedLeaveDays(new Date());
    result = await db.query(
      `INSERT INTO leave_balances (employee_id, year, total_days_allocated, days_used, days_remaining, last_accrual_date)
       VALUES ($1, $2, 18.00, 0.00, $3, CURRENT_DATE)
       RETURNING *`,
      [employeeId, year, accruedDays]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error('Error getting leave balance:', err);
    throw err;
  }
}

/**
 * Update leave balance to reflect current accrued days
 * @param {number} employeeId 
 * @param {number} year 
 * @returns {Promise<object>} - Updated leave balance
 */
async function updateAccruedLeave(employeeId, year = new Date().getFullYear()) {
  try {
    const accruedDays = calculateAccruedLeaveDays(new Date());
    
    const result = await db.query(
      `UPDATE leave_balances 
       SET days_remaining = $1 - days_used,
           last_accrual_date = CURRENT_DATE,
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $2 AND year = $3
       RETURNING *`,
      [accruedDays, employeeId, year]
    );
    
    if (result.rows.length === 0) {
      // Create if doesn't exist
      return await getLeaveBalance(employeeId, year);
    }
    
    return result.rows[0];
  } catch (err) {
    console.error('Error updating accrued leave:', err);
    throw err;
  }
}

/**
 * Calculate paid and unpaid days for a leave request
 * @param {number} employeeId 
 * @param {number} daysRequested 
 * @param {number} year 
 * @returns {Promise<object>} - { daysPaid, daysUnpaid, isFullyPaid, remainingBalance }
 */
async function calculatePaidUnpaidDays(employeeId, daysRequested, year = new Date().getFullYear()) {
  try {
    // Update accrued leave first
    const balance = await updateAccruedLeave(employeeId, year);
    
    const daysRemaining = parseFloat(balance.days_remaining);
    
    if (daysRemaining >= daysRequested) {
      // Fully paid
      return {
        daysPaid: daysRequested,
        daysUnpaid: 0,
        isFullyPaid: true,
        remainingBalance: daysRemaining
      };
    } else if (daysRemaining > 0) {
      // Partially paid
      return {
        daysPaid: daysRemaining,
        daysUnpaid: daysRequested - daysRemaining,
        isFullyPaid: false,
        remainingBalance: daysRemaining
      };
    } else {
      // Fully unpaid
      return {
        daysPaid: 0,
        daysUnpaid: daysRequested,
        isFullyPaid: false,
        remainingBalance: daysRemaining
      };
    }
  } catch (err) {
    console.error('Error calculating paid/unpaid days:', err);
    throw err;
  }
}

/**
 * Deduct leave days from employee balance
 * @param {number} employeeId 
 * @param {number} daysPaid 
 * @param {number} year 
 * @returns {Promise<object>} - Updated balance
 */
async function deductLeaveDays(employeeId, daysPaid, year = new Date().getFullYear()) {
  try {
    const result = await db.query(
      `UPDATE leave_balances 
       SET days_used = days_used + $1,
           days_remaining = days_remaining - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $2 AND year = $3
       RETURNING *`,
      [daysPaid, employeeId, year]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error('Error deducting leave days:', err);
    throw err;
  }
}

/**
 * Restore leave days to employee balance (when leave is rejected or deleted)
 * @param {number} employeeId 
 * @param {number} daysPaid 
 * @param {number} year 
 * @returns {Promise<object>} - Updated balance
 */
async function restoreLeaveDays(employeeId, daysPaid, year = new Date().getFullYear()) {
  try {
    const result = await db.query(
      `UPDATE leave_balances 
       SET days_used = GREATEST(0, days_used - $1),
           days_remaining = days_remaining + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE employee_id = $2 AND year = $3
       RETURNING *`,
      [daysPaid, employeeId, year]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error('Error restoring leave days:', err);
    throw err;
  }
}

/**
 * Get leave balance summary for an employee
 * @param {number} employeeId 
 * @param {number} year 
 * @returns {Promise<object>} - Balance summary with accrued info
 */
async function getLeaveBalanceSummary(employeeId, year = new Date().getFullYear()) {
  try {
    const balance = await updateAccruedLeave(employeeId, year);
    const accruedToday = calculateAccruedLeaveDays(new Date());
    
    return {
      employeeId,
      year,
      totalAllocated: parseFloat(balance.total_days_allocated) || 18.0,
      accruedToDate: accruedToday,
      daysUsed: parseFloat(balance.days_used) || 0,
      daysRemaining: accruedToday - (parseFloat(balance.days_used) || 0),
      lastAccrualDate: balance.last_accrual_date || new Date().toISOString()
    };
  } catch (err) {
    console.error('Error getting leave balance summary:', err);
    // Return default balance instead of throwing
    return {
      employeeId,
      year,
      totalAllocated: 18.0,
      accruedToDate: 0,
      daysUsed: 0,
      daysRemaining: 0,
      lastAccrualDate: new Date().toISOString(),
      error: 'Using default balance'
    };
  }
}

module.exports = {
  calculateAccruedLeaveDays,
  calculateLeaveDays,
  getLeaveBalance,
  updateAccruedLeave,
  calculatePaidUnpaidDays,
  deductLeaveDays,
  restoreLeaveDays,
  getLeaveBalanceSummary
};
