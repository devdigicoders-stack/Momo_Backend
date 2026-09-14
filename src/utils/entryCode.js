const crypto = require('crypto');

/**
 * Generate human-readable entry code
 * Example: EXP-20260914-4891
 */
const generateEntryCode = (prefix, dateObj = new Date()) => {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomSuffix}`;
};

module.exports = {
  generateEntryCode,
};
