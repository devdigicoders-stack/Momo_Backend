/**
 * Helper to build Date range filters based on preset or custom range
 * @param {string} preset - 'today' | 'yesterday' | 'this_week' | 'custom'
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @returns {object|null} Mongoose date query object
 */
const buildDateFilter = (preset, fromDate, toDate) => {
  const now = new Date();

  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (preset === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (preset === 'this_week') {
    const start = new Date(now);
    const day = start.getDay(); // 0 is Sunday
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (fromDate || toDate) {
    const filter = {};
    if (fromDate) {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      filter.$gte = start;
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      filter.$lte = end;
    }
    return filter;
  }

  return null;
};

/**
 * Standardize pagination params
 */
const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

module.exports = {
  buildDateFilter,
  getPagination,
};
