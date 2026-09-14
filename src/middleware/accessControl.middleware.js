const DailyStatus = require('../models/DailyStatus');
const { formatDateStr } = require('./dateLock.middleware');

/**
 * Validate Date Rules:
 * 1. Future date protection (Unless allowFuture === true)
 * 2. 45-day rolling access boundary for MAIN_MANAGER & MANAGER_2
 * 3. Daily Date Lock (LOCKED dates can only be altered by SUPER_ADMIN)
 *
 * @param {Object} options
 * @param {Date|String} options.dateValue The target record date
 * @param {Object} options.user Authenticated user object from req.user
 * @param {Boolean} [options.allowFuture=false] Whether future dates are permitted (e.g. for Chef Requirements)
 * @returns {Promise<{ isValid: boolean, status: number, message: string }>}
 */
const validateDateAccess = async ({ dateValue, user, allowFuture = false }) => {
  if (!dateValue) {
    return { isValid: false, status: 400, message: 'Date is required' };
  }

  const targetDate = new Date(dateValue);
  if (isNaN(targetDate.getTime())) {
    return { isValid: false, status: 400, message: 'Invalid date provided' };
  }

  // 1. Future Date Protection
  if (!allowFuture) {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (targetDate > endOfToday) {
      return {
        isValid: false,
        status: 400,
        message: 'Future date entries are not allowed.',
      };
    }
  }

  // 2. 45-Day Access Control for Managers
  const role = user?.role;
  if (role === 'MAIN_MANAGER' || role === 'MANAGER_2') {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    fortyFiveDaysAgo.setHours(0, 0, 0, 0);

    if (targetDate < fortyFiveDaysAgo) {
      return {
        isValid: false,
        status: 403,
        message: 'You can only access records from the previous 45 days.',
      };
    }
  }

  // 3. Date Lock Check (Super Admin overrides lock)
  if (role !== 'SUPER_ADMIN') {
    const dateStr = formatDateStr(targetDate);
    if (dateStr) {
      const statusDoc = await DailyStatus.findOne({ date: dateStr });
      if (statusDoc && statusDoc.status === 'LOCKED') {
        return {
          isValid: false,
          status: 403,
          message: `This date is locked. You cannot modify records for this date.`,
        };
      }
    }
  }

  return { isValid: true };
};

/**
 * Apply 45-day lower bound to query filters for MAIN_MANAGER and MANAGER_2
 *
 * @param {Object} req Express request
 * @param {Object} filter Mongoose filter object
 * @param {String} [dateField='date'] Name of the date field in the schema
 */
const apply45DayQueryLimit = (req, filter, dateField = 'date') => {
  const role = req?.user?.role;
  if (role === 'MAIN_MANAGER' || role === 'MANAGER_2') {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    fortyFiveDaysAgo.setHours(0, 0, 0, 0);

    if (filter[dateField]) {
      if (filter[dateField].$gte && new Date(filter[dateField].$gte) < fortyFiveDaysAgo) {
        filter[dateField].$gte = fortyFiveDaysAgo;
      } else if (!filter[dateField].$gte) {
        filter[dateField] = { ...filter[dateField], $gte: fortyFiveDaysAgo };
      }
    } else {
      filter[dateField] = { $gte: fortyFiveDaysAgo };
    }
  }
};

module.exports = {
  validateDateAccess,
  apply45DayQueryLimit,
};
