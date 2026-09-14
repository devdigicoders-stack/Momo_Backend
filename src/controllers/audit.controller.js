const AuditLog = require('../models/AuditLog');
const { getPagination } = require('../utils/queryHelpers');

/**
 * Helper: Apply role-based module restrictions and 45-day operational limits
 */
const applyRoleAuditRestrictions = (req, filter) => {
  const role = req.user?.role;

  // 1. Module Level Access Control
  if (role === 'CHEF') {
    filter.module = 'CHEF_REQUIREMENT';
  } else if (role === 'MANAGER_2') {
    // MANAGER_2 cannot see SALES audit records
    if (filter.module === 'SALES') {
      filter.module = '__FORBIDDEN__'; // will return empty
    } else if (!filter.module || filter.module === 'all') {
      filter.module = { $ne: 'SALES' };
    }
  }

  // 2. 45-Day Operational Limit for Managers
  if (role === 'MAIN_MANAGER' || role === 'MANAGER_2') {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    fortyFiveDaysAgo.setHours(0, 0, 0, 0);

    if (filter.timestamp) {
      if (filter.timestamp.$gte && new Date(filter.timestamp.$gte) < fortyFiveDaysAgo) {
        filter.timestamp.$gte = fortyFiveDaysAgo;
      } else if (!filter.timestamp.$gte) {
        filter.timestamp = { ...filter.timestamp, $gte: fortyFiveDaysAgo };
      }
    } else {
      filter.timestamp = { $gte: fortyFiveDaysAgo };
    }
  }
};

/**
 * @desc Get all audit logs with filters and pagination
 * @route GET /api/audit
 */
const getAuditLogs = async (req, res) => {
  try {
    const { module: moduleName, action, performedBy, startDate, endDate, search, recordId, page, limit } = req.query;
    const filter = {};

    if (moduleName && moduleName !== 'all') {
      filter.module = moduleName.toUpperCase();
    }

    if (action && action !== 'all') {
      filter.action = action.toUpperCase();
    }

    if (performedBy && performedBy !== 'all') {
      filter.performedBy = performedBy;
    }

    if (recordId) {
      filter.recordId = recordId;
    }

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        filter.timestamp.$gte = sDate;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = eDate;
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [{ entryCode: searchRegex }, { reason: searchRegex }];
    }

    // Apply role-based access rules & 45-day window
    applyRoleAuditRestrictions(req, filter);

    const { pageNum, limitNum, skip } = getPagination(page, limit || 25);

    const [auditLogs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name role email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: auditLogs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error in getAuditLogs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message,
    });
  }
};

/**
 * @desc Get complete chronological audit history for a specific record
 * @route GET /api/audit/record/:recordId
 */
const getAuditLogsByRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    const filter = { recordId };

    applyRoleAuditRestrictions(req, filter);

    const auditLogs = await AuditLog.find(filter)
      .populate('performedBy', 'name role email')
      .sort({ timestamp: 1 });

    return res.status(200).json({
      success: true,
      data: auditLogs,
    });
  } catch (error) {
    console.error('Error in getAuditLogsByRecord:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch record audit trail',
      error: error.message,
    });
  }
};

/**
 * @desc Get overview audit statistics and KPIs
 * @route GET /api/audit/summary/stats
 */
const getAuditStats = async (req, res) => {
  try {
    const baseFilter = {};
    applyRoleAuditRestrictions(req, baseFilter);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalEdits, todayEdits, monthEdits, moduleBreakdown, topUsers] = await Promise.all([
      AuditLog.countDocuments({ ...baseFilter, action: 'EDIT' }),
      AuditLog.countDocuments({ ...baseFilter, action: 'EDIT', timestamp: { $gte: todayStart } }),
      AuditLog.countDocuments({ ...baseFilter, action: 'EDIT', timestamp: { $gte: monthStart } }),
      AuditLog.aggregate([
        { $match: { ...baseFilter } },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: { ...baseFilter } },
        { $group: { _id: '$performedBy', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            count: 1,
            name: '$user.name',
            role: '$user.role',
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalEdits,
        todayEdits,
        monthEdits,
        moduleBreakdown: moduleBreakdown.map((m) => ({ module: m._id, count: m.count })),
        topUsers,
      },
    });
  } catch (error) {
    console.error('Error in getAuditStats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit stats',
      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
  getAuditLogsByRecord,
  getAuditStats,
};
