const DailyStatus = require('../models/DailyStatus');
const Sales = require('../models/Sales');
const Expense = require('../models/Expense');
const MomoPurchase = require('../models/MomoPurchase');
const CashEntry = require('../models/CashEntry');
const AdditionalCash = require('../models/AdditionalCash');
const CashDeposit = require('../models/CashDeposit');
const ChefRequirement = require('../models/ChefRequirement');
const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notification.service');
const { formatDateStr } = require('../middleware/dateLock.middleware');

// Helper to get start and end of day in UTC
const getDayBounds = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return { start, end };
};

/**
 * @desc Get Daily Status, Operational Checklist & Summary Counts
 * @route GET /api/daily-control/status?date=YYYY-MM-DD
 */
exports.getDailyStatusAndChecklist = async (req, res) => {
  try {
    const todayStr = formatDateStr(new Date());
    const dateStr = req.query.date ? req.query.date.trim() : todayStr;
    const { start, end } = getDayBounds(dateStr);

    // 1. Get or initialize DailyStatus
    let dailyStatus = await DailyStatus.findOne({ date: dateStr })
      .populate('completedBy', 'name role')
      .populate('lockedBy', 'name role');

    if (!dailyStatus) {
      dailyStatus = {
        date: dateStr,
        status: 'OPEN',
        notes: '',
        completedBy: null,
        completedAt: null,
        lockedBy: null,
        lockedAt: null,
      };
    }

    const userRole = req.user.role;

    // 2. Fetch counts and latest entries
    const [
      salesCount,
      expenseCount,
      momoCount,
      cashEntryCount,
      addCashCount,
      depositCount,
      chefCount,
    ] = await Promise.all([
      Sales.countDocuments({ date: { $gte: start, $lte: end } }),
      Expense.countDocuments({ date: { $gte: start, $lte: end } }),
      MomoPurchase.countDocuments({ date: { $gte: start, $lte: end } }),
      CashEntry.countDocuments({ date: { $gte: start, $lte: end } }),
      AdditionalCash.countDocuments({ date: { $gte: start, $lte: end }, status: 'ACTIVE' }),
      CashDeposit.countDocuments({ date: { $gte: start, $lte: end }, status: 'ACTIVE' }),
      ChefRequirement.countDocuments({ date: { $gte: start, $lte: end } }),
    ]);

    const cashCount = cashEntryCount + addCashCount + depositCount;

    // 3. Build Checklist according to role
    const checklist = [];

    if (userRole !== 'MANAGER_2' && userRole !== 'CHEF') {
      checklist.push({
        module: 'Sales',
        label: 'Sales Entry',
        count: salesCount,
        status: salesCount > 0 ? 'Added' : 'Pending',
        route: '/sales',
      });
    }

    if (userRole !== 'CHEF') {
      checklist.push({
        module: 'Expenses',
        label: 'Expense Entry',
        count: expenseCount,
        status: expenseCount > 0 ? 'Added' : 'Pending',
        route: '/expenses',
      });
      checklist.push({
        module: 'MomoPurchase',
        label: 'Momo Purchase',
        count: momoCount,
        status: momoCount > 0 ? 'Added' : 'Pending',
        route: '/momo-purchases',
      });
      checklist.push({
        module: 'Cash',
        label: 'Cash Drawer',
        count: cashCount,
        status: cashCount > 0 ? 'Added' : 'Pending',
        route: '/cash',
      });
    }

    checklist.push({
      module: 'ChefRequirement',
      label: 'Chef Requirements',
      count: chefCount,
      status: chefCount > 0 ? 'Added' : 'Pending',
      route: '/chef',
    });

    const totalEntries =
      (userRole === 'MANAGER_2' || userRole === 'CHEF' ? 0 : salesCount) +
      (userRole === 'CHEF' ? 0 : expenseCount + momoCount + cashCount) +
      chefCount;

    res.status(200).json({
      success: true,
      data: {
        date: dateStr,
        status: dailyStatus.status,
        notes: dailyStatus.notes,
        completedBy: dailyStatus.completedBy,
        completedAt: dailyStatus.completedAt,
        lockedBy: dailyStatus.lockedBy,
        lockedAt: dailyStatus.lockedAt,
        checklist,
        summaryCounts: {
          sales: userRole === 'MANAGER_2' ? undefined : salesCount,
          expenses: userRole === 'CHEF' ? undefined : expenseCount,
          momoPurchases: userRole === 'CHEF' ? undefined : momoCount,
          cashEntries: userRole === 'CHEF' ? undefined : cashCount,
          chefRequirements: chefCount,
          totalEntries,
        },
      },
    });
  } catch (error) {
    console.error('getDailyStatus error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily status and checklist',
      error: error.message,
    });
  }
};

/**
 * @desc Toggle Daily Status between OPEN and COMPLETED
 * @route POST /api/daily-control/toggle-status
 */
exports.toggleDailyStatus = async (req, res) => {
  try {
    const { date, status, notes } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const dateStr = formatDateStr(date);
    let dailyStatus = await DailyStatus.findOne({ date: dateStr });

    if (dailyStatus && dailyStatus.status === 'LOCKED' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'This date is locked by Super Admin and cannot be modified.',
      });
    }

    const targetStatus = status || (dailyStatus?.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED');

    if (!dailyStatus) {
      dailyStatus = new DailyStatus({
        date: dateStr,
        status: targetStatus,
        notes: notes || '',
        completedBy: targetStatus === 'COMPLETED' ? req.user._id : null,
        completedAt: targetStatus === 'COMPLETED' ? new Date() : null,
      });
    } else {
      dailyStatus.status = targetStatus;
      if (notes !== undefined) dailyStatus.notes = notes;
      dailyStatus.completedBy = targetStatus === 'COMPLETED' ? req.user._id : null;
      dailyStatus.completedAt = targetStatus === 'COMPLETED' ? new Date() : null;
    }

    await dailyStatus.save();
    await dailyStatus.populate('completedBy', 'name role');

    // Create In-App Notification and FCM Push
    await sendNotification({
      title: `Daily Status Updated (${dateStr})`,
      message: `${dateStr} marked as ${targetStatus} by ${req.user.name} (${req.user.role})`,
      type: targetStatus === 'COMPLETED' ? 'success' : 'info',
      category: 'LOCK',
      targetRoles: ['SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'],
      data: {
        category: 'LOCK',
        date: dateStr,
        status: targetStatus,
        screen: 'Daily Control',
      },
      createdBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: `Daily status for ${dateStr} updated to ${targetStatus}`,
      data: dailyStatus,
    });
  } catch (error) {
    console.error('toggleDailyStatus error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update daily status',
      error: error.message,
    });
  }
};

/**
 * @desc Lock/Unlock Date for Operational Editing (Super Admin Only)
 * @route POST /api/daily-control/lock
 */
exports.toggleDateLock = async (req, res) => {
  try {
    const { date, lock, notes } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required (YYYY-MM-DD)',
      });
    }

    const dateStr = date.trim();
    let dailyStatus = await DailyStatus.findOne({ date: dateStr });

    const shouldLock = lock !== undefined ? Boolean(lock) : dailyStatus?.status !== 'LOCKED';
    const targetStatus = shouldLock ? 'LOCKED' : 'OPEN';

    if (!dailyStatus) {
      dailyStatus = new DailyStatus({
        date: dateStr,
        status: targetStatus,
        notes: notes || '',
        lockedBy: shouldLock ? req.user._id : null,
        lockedAt: shouldLock ? new Date() : null,
      });
    } else {
      dailyStatus.status = targetStatus;
      if (notes !== undefined) dailyStatus.notes = notes;
      dailyStatus.lockedBy = shouldLock ? req.user._id : null;
      dailyStatus.lockedAt = shouldLock ? new Date() : null;
    }

    await dailyStatus.save();
    await dailyStatus.populate('lockedBy', 'name role');

    // Create In-App Notification and FCM Push
    await sendNotification({
      title: shouldLock ? `Date Locked (${dateStr})` : `Date Unlocked (${dateStr})`,
      message: shouldLock
        ? `Entries for ${dateStr} have been LOCKED by Super Admin (${req.user.name}).`
        : `Entries for ${dateStr} have been UNLOCKED for operational editing.`,
      type: shouldLock ? 'lock' : 'info',
      category: 'LOCK',
      targetRoles: ['SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'],
      data: {
        category: 'LOCK',
        date: dateStr,
        status: targetStatus,
        screen: 'Daily Control',
      },
      createdBy: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: `Date ${dateStr} is now ${targetStatus}`,
      data: dailyStatus,
    });
  } catch (error) {
    console.error('toggleDateLock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle date lock',
      error: error.message,
    });
  }
};

/**
 * @desc Get Combined Recent Entries for the Logged-in User
 * @route GET /api/daily-control/my-recent-entries
 */
exports.getMyRecentEntries = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const limit = parseInt(req.query.limit, 10) || 15;

    const queries = [];

    if (userRole !== 'MANAGER_2' && userRole !== 'CHEF') {
      queries.push(
        Sales.find({ enteredBy: userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Sales',
              entryCode: i.entryCode || `SAL-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `₹${Number(i.amount).toLocaleString('en-IN')} (${i.paymentMode})`,
              details: i.remarks || 'Daily sales entry',
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
    }

    if (userRole !== 'CHEF') {
      queries.push(
        Expense.find({ enteredBy: userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Expense',
              entryCode: i.entryCode || `EXP-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `₹${Number(i.amount).toLocaleString('en-IN')} - ${i.category} (${i.item})`,
              details: i.subcategory ? `${i.subcategory}` : i.remarks,
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
      queries.push(
        MomoPurchase.find({ enteredBy: userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Momo Purchase',
              entryCode: i.entryCode || `MOM-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `${i.quantity} pcs ${i.momoType} (₹${i.totalAmount})`,
              details: `Rate: ₹${i.rate}/pc | Supplier: ${i.supplierName || 'Standard'}`,
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
      queries.push(
        CashEntry.find({ enteredBy: userId })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Cash Drawer',
              entryCode: i.entryCode || `CSH-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `Closing: ₹${Number(i.closingCash).toLocaleString('en-IN')} (Opening: ₹${i.openingCash})`,
              details: i.remarks || 'Daily cash drawer',
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
      queries.push(
        AdditionalCash.find({ enteredBy: userId, status: 'ACTIVE' })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Additional Cash',
              entryCode: i.entryCode || `ADC-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `₹${Number(i.amount).toLocaleString('en-IN')} from ${i.providedBy}`,
              details: i.reason || i.remarks || 'Additional cash',
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
      queries.push(
        CashDeposit.find({ enteredBy: userId, status: 'ACTIVE' })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean()
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              type: 'Cash Deposit',
              entryCode: i.entryCode || `DEP-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
              date: i.date,
              summary: `₹${Number(i.amount).toLocaleString('en-IN')} to ${i.bank}`,
              details: `A/C: ${i.account}`,
              createdAt: i.createdAt,
              isEdited: i.isEdited || false,
              raw: i,
            }))
          )
      );
    }

    queries.push(
      ChefRequirement.find({ enteredBy: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .then((items) =>
          items.map((i) => ({
            _id: i._id,
            type: 'Chef Requirement',
            entryCode: i.entryCode || `REQ-${formatDateStr(i.date)}-${i._id.toString().slice(-4)}`,
            date: i.date,
            summary: `${i.quantity} ${i.unit} ${i.itemName}`,
            details: `Priority: ${i.priority} | Status: ${i.status}`,
            createdAt: i.createdAt,
            isEdited: i.isEdited || false,
            raw: i,
          }))
        )
    );

    const results = await Promise.all(queries);
    const combined = results.flat();
    combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      data: combined.slice(0, limit),
    });
  } catch (error) {
    console.error('getMyRecentEntries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent entries',
      error: error.message,
    });
  }
};
