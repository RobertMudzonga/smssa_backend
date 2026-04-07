/**
 * Date Parser Utility - Extracts follow-up dates from note text
 * Supports natural language patterns like "call on 15 Apr", "next Monday", "in 3 days", etc.
 */

const chrono = require('chrono-node');
const moment = require('moment');

/**
 * Parse natural language date from text
 * @param {string} text - The note text to parse
 * @returns {Date|null} - Parsed date or null if no date found
 */
function parseFollowUpDate(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    try {
        // Use chrono-node to parse natural language dates
        const results = chrono.parse(text, new Date(), { forwardDate: true });
        
        if (results && results.length > 0) {
            const parsedDate = results[0].start.date();
            
            // Only return dates that are in the future (not past)
            if (parsedDate > new Date()) {
                return parsedDate;
            }
        }
    } catch (error) {
        console.error('Error parsing date:', error);
    }

    return null;
}

/**
 * Extract follow-up date from note text using pattern matching
 * Falls back to regex patterns if chrono-node parsing fails
 * @param {string} text - The note text to parse
 * @returns {Date|null} - Parsed date or null if no date found
 */
function extractFollowUpDateFromNote(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    // Try chrono-node first
    const chronoDate = parseFollowUpDate(text);
    if (chronoDate) {
        return chronoDate;
    }

    // Fallback to manual pattern matching for common phrases
    const lowerText = text.toLowerCase();

    // Pattern: "call on 15 Apr" or "follow-up on 15 April"
    const datePattern = /(?:call|follow[\s-]?up|schedule|meeting|contact|reach out)[\s]+(?:on|for)[\s]+(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)/i;
    const dateMatch = text.match(datePattern);
    if (dateMatch) {
        const day = dateMatch[1];
        const month = dateMatch[2];
        try {
            const dateStr = `${day} ${month} ${new Date().getFullYear()}`;
            const parsed = moment(dateStr, 'D MMMM YYYY', true);
            if (parsed.isValid()) {
                const result = parsed.toDate();
                // If the date has already passed this year, assume next year
                if (result < new Date()) {
                    result.setFullYear(result.getFullYear() + 1);
                }
                return result;
            }
        } catch (e) {
            // Continue to next pattern
        }
    }

    // Pattern: "in 3 days", "in 2 weeks", "in 1 month"
    const relativePattern = /(?:call|follow[\s-]?up|schedule|meeting|contact)[\s]+(?:in|after)[\s]+(\d+)\s+(day|week|month|hour)s?/i;
    const relativeMatch = text.match(relativePattern);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        try {
            const future = moment().add(amount, unit + 's');
            return future.toDate();
        } catch (e) {
            // Continue to next pattern
        }
    }

    // Pattern: "next Monday", "this Friday", "next week"
    const dayPattern = /(?:call|follow[\s-]?up|schedule|meeting|contact)[\s]+(?:next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)/i;
    const dayMatch = text.match(dayPattern);
    if (dayMatch) {
        const dayOrPeriod = dayMatch[1].toLowerCase();
        try {
            let future;
            if (dayOrPeriod === 'week') {
                future = moment().add(1, 'week');
            } else if (dayOrPeriod === 'month') {
                future = moment().add(1, 'month');
            } else {
                // It's a day of week
                const dayNum = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(dayOrPeriod);
                future = moment().day(dayNum);
                // If the day hasn't passed this week, set it; otherwise set it for next week
                if (future.isBefore(moment())) {
                    future.add(1, 'week');
                }
            }
            return future.toDate();
        } catch (e) {
            // Continue
        }
    }

    return null;
}

/**
 * Format a date for database storage (YYYY-MM-DD)
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
function formatDateForDB(date) {
    if (!date) return null;
    return moment(date).format('YYYY-MM-DD');
}

/**
 * Format a date for display (e.g., "15 Apr 2026")
 * @param {Date|string} date - The date to format
 * @returns {string} - Formatted date string
 */
function formatDateForDisplay(date) {
    if (!date) return null;
    return moment(date).format('D MMM YYYY');
}

module.exports = {
    parseFollowUpDate,
    extractFollowUpDateFromNote,
    formatDateForDB,
    formatDateForDisplay
};
