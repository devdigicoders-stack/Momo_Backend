const DailyStatus = require('../models/DailyStatus');

/**
 * Format any date object or string into YYYY-MM-DD
 */
const formatDateStr = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Check if the target date is locked.
 * Super Admin bypasses date locking.
 */
const checkDateLock = async (dateValue, user) => {
  if (!dateValue || !user) return { isLocked: false };
  if (user.role === 'SUPER_ADMIN') return { isLocked: false };

  const dateStr = formatDateStr(dateValue);
  if (!dateStr) return { isLocked: false };

  const statusDoc = await DailyStatus.findOne({ date: dateStr });
  if (statusDoc && statusDoc.status === 'LOCKED') {
    return {
      isLocked: true,
      message: `Operational entries for ${dateStr} are LOCKED by management. Only Super Admin can modify records for locked dates.`,
    };
  }
  return { isLocked: false };
};

module.exports = {
  formatDateStr,
  checkDateLock,
};
