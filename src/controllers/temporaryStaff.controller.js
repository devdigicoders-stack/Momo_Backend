const TemporaryStaff = require('../models/TemporaryStaff');
const TemporaryStaffWork = require('../models/TemporaryStaffWork');
const TemporaryStaffPayment = require('../models/TemporaryStaffPayment');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess } = require('../middleware/accessControl.middleware');

/**
 * Helper: Parse YYYY-MM into start and end Date objects
 */
const getMonthBounds = (monthStr) => {
  let year, month;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const parts = monthStr.split('-').map(Number);
    year = parts[0];
    month = parts[1] - 1; // 0-indexed
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const formattedMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  return { startOfMonth, endOfMonth, daysInMonth, formattedMonth };
};

/**
 * Helper: Normalize a date string or object to local midnight
 */
const normalizeDate = (dateInput) => {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Helper: enforce 45-day operational rule for Managers
 */
const enforce45DayLimit = (req, queryFilter) => {
  if (req.user.role === 'MAIN_MANAGER' || req.user.role === 'MANAGER_2') {
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
    fortyFiveDaysAgo.setHours(0, 0, 0, 0);

    if (queryFilter.date) {
      if (queryFilter.date.$gte && new Date(queryFilter.date.$gte) < fortyFiveDaysAgo) {
        queryFilter.date.$gte = fortyFiveDaysAgo;
      } else if (!queryFilter.date.$gte) {
        queryFilter.date = { ...queryFilter.date, $gte: fortyFiveDaysAgo };
      }
    } else if (queryFilter.paymentDate) {
      if (queryFilter.paymentDate.$gte && new Date(queryFilter.paymentDate.$gte) < fortyFiveDaysAgo) {
        queryFilter.paymentDate.$gte = fortyFiveDaysAgo;
      } else if (!queryFilter.paymentDate.$gte) {
        queryFilter.paymentDate = { ...queryFilter.paymentDate, $gte: fortyFiveDaysAgo };
      }
    }
  }
};

// =========================================================================
// 1. TEMPORARY STAFF MASTER CRUD
// =========================================================================

/**
 * @desc Get all temporary staff with filters and search
 * @route GET /api/temporary-staff
 */
const getTemporaryStaffList = async (req, res) => {
  try {
    const { status, search, page, limit } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [{ name: searchRegex }, { mobile: searchRegex }, { entryCode: searchRegex }];
    }

    const { pageNum, limitNum, skip } = getPagination(page, limit || 50);

    const [staffList, total] = await Promise.all([
      TemporaryStaff.find(filter)
        .populate('enteredBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .sort({ status: 1, name: 1 })
        .skip(skip)
        .limit(limitNum),
      TemporaryStaff.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: staffList,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error in getTemporaryStaffList:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch temporary staff list',
      error: error.message,
    });
  }
};

/**
 * @desc Create new temporary staff
 * @route POST /api/temporary-staff
 */
const createTemporaryStaff = async (req, res) => {
  try {
    const { name, mobile, status, remarks, photo } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Temporary staff name is required',
      });
    }

    if (mobile && mobile.trim() && !/^[0-9]{10}$/.test(mobile.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be exactly 10 digits',
      });
    }

    const entryCode = generateEntryCode('TST');

    const newStaff = await TemporaryStaff.create({
      name: name.trim(),
      mobile: mobile ? mobile.trim() : '',
      photo: photo || '',
      status: status || 'Active',
      remarks: remarks ? remarks.trim() : '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await TemporaryStaff.findById(newStaff._id).populate('enteredBy', 'name role');

    return res.status(201).json({
      success: true,
      message: 'Temporary staff created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in createTemporaryStaff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create temporary staff',
      error: error.message,
    });
  }
};

/**
 * @desc Update temporary staff
 * @route PUT /api/temporary-staff/:id
 */
const updateTemporaryStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, status, remarks, photo } = req.body;

    const staff = await TemporaryStaff.findById(id);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Temporary staff not found',
      });
    }

    if (name && !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Staff name cannot be empty',
      });
    }

    if (mobile && mobile.trim() && !/^[0-9]{10}$/.test(mobile.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be exactly 10 digits',
      });
    }

    const previousData = {
      name: staff.name,
      mobile: staff.mobile,
      status: staff.status,
      remarks: staff.remarks,
      photo: staff.photo,
    };

    if (name) staff.name = name.trim();
    if (mobile !== undefined) staff.mobile = mobile ? mobile.trim() : '';
    if (status) staff.status = status;
    if (remarks !== undefined) staff.remarks = remarks ? remarks.trim() : '';
    if (photo !== undefined) staff.photo = photo;

    staff.isEdited = true;
    staff.lastUpdatedBy = req.user._id;
    staff.editHistory.push({
      previousData,
      updatedData: {
        name: staff.name,
        mobile: staff.mobile,
        status: staff.status,
        remarks: staff.remarks,
        photo: staff.photo,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: req.body.editReason || 'Staff details update',
    });

    await staff.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: staff._id,
      module: 'TEMPORARY_STAFF',
      entryCode: staff.entryCode || '',
      action: 'EDIT',
      originalData: previousData,
      updatedData: {
        name: staff.name,
        mobile: staff.mobile,
        status: staff.status,
        remarks: staff.remarks,
        photo: staff.photo,
      },
      reason: req.body.editReason || 'Staff details update',
    });

    const populated = await TemporaryStaff.findById(staff._id)
      .populate('enteredBy', 'name role')
      .populate('lastUpdatedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Temporary staff updated successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in updateTemporaryStaff:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update temporary staff',
      error: error.message,
    });
  }
};

// =========================================================================
// 2. WORKED DATE ENTRY (WORK LOG)
// =========================================================================

/**
 * @desc Get worked date entries
 * @route GET /api/temporary-staff/work
 */
const getWorkEntries = async (req, res) => {
  try {
    const { staffId, startDate, endDate, month, search, page, limit } = req.query;
    const filter = {};

    if (staffId && staffId !== 'all') {
      filter.staff = staffId;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { startOfMonth, endOfMonth } = getMonthBounds(month);
      filter.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = normalizeDate(startDate);
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        filter.date.$lte = endD;
      }
    }

    // 45-day access rule for managers
    enforce45DayLimit(req, filter);

    const { pageNum, limitNum, skip } = getPagination(page, limit || 50);

    const [entries, total] = await Promise.all([
      TemporaryStaffWork.find(filter)
        .populate('staff', 'name mobile status entryCode')
        .populate('enteredBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      TemporaryStaffWork.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error in getWorkEntries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch work entries',
      error: error.message,
    });
  }
};

/**
 * @desc Record a worked date entry for a temporary staff
 * @route POST /api/temporary-staff/work
 */
const createWorkEntry = async (req, res) => {
  try {
    const { staffId, date, dailyWage, remarks } = req.body;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'Temporary staff reference is required',
      });
    }

    const staff = await TemporaryStaff.findById(staffId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Temporary staff not found',
      });
    }

    if (staff.status === 'Inactive') {
      return res.status(400).json({
        success: false,
        message: 'Cannot add work entry for an Inactive staff member. Please activate staff first.',
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Worked date is required',
      });
    }

    const normalizedDate = normalizeDate(date);

    // Validate Future Date, 45-day rule, and Date Lock
    const dateValidation = await validateDateAccess({
      dateValue: normalizedDate,
      user: req.user,
      allowFuture: false,
    });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({
        success: false,
        message: dateValidation.message,
      });
    }

    const numWage = Number(dailyWage);
    if (isNaN(numWage) || numWage <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Daily wage must be a valid positive number greater than 0',
      });
    }

    // Duplicate Check: Same temporary staff on same worked date
    const startOfTargetDay = new Date(normalizedDate);
    const endOfTargetDay = new Date(normalizedDate);
    endOfTargetDay.setHours(23, 59, 59, 999);

    const duplicate = await TemporaryStaffWork.findOne({
      staff: staffId,
      date: { $gte: startOfTargetDay, $lte: endOfTargetDay },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: 'This staff already has a work entry for this date.',
      });
    }

    const entryCode = generateEntryCode('TWR', normalizedDate);

    const workEntry = await TemporaryStaffWork.create({
      staff: staffId,
      date: normalizedDate,
      dailyWage: numWage,
      remarks: remarks ? remarks.trim() : '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await TemporaryStaffWork.findById(workEntry._id)
      .populate('staff', 'name mobile status entryCode')
      .populate('enteredBy', 'name role');

    return res.status(201).json({
      success: true,
      message: 'Worked date recorded successfully',
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This staff already has a work entry for this date.',
      });
    }
    console.error('Error in createWorkEntry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record work entry',
      error: error.message,
    });
  }
};

/**
 * @desc Update a worked date entry
 * @route PUT /api/temporary-staff/work/:id
 */
const updateWorkEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, dailyWage, remarks, editReason } = req.body;

    const workEntry = await TemporaryStaffWork.findById(id);
    const check1 = await validateDateAccess({ dateValue: workEntry.date, user: req.user, allowFuture: false });
    if (!check1.isValid) {
      return res.status(check1.status).json({ success: false, message: check1.message });
    }
    if (date) {
      const check2 = await validateDateAccess({ dateValue: date, user: req.user, allowFuture: false });
      if (!check2.isValid) {
        return res.status(check2.status).json({ success: false, message: check2.message });
      }
    }

    const previousData = {
      date: workEntry.date,
      dailyWage: workEntry.dailyWage,
      remarks: workEntry.remarks,
    };

    if (date) {
      const normalizedDate = normalizeDate(date);
      // Check duplicate if date is changed
      const startOfTargetDay = new Date(normalizedDate);
      const endOfTargetDay = new Date(normalizedDate);
      endOfTargetDay.setHours(23, 59, 59, 999);

      const duplicate = await TemporaryStaffWork.findOne({
        _id: { $ne: id },
        staff: workEntry.staff,
        date: { $gte: startOfTargetDay, $lte: endOfTargetDay },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'This staff already has a work entry for this date.',
        });
      }
      workEntry.date = normalizedDate;
    }

    if (dailyWage !== undefined) {
      const numWage = Number(dailyWage);
      if (isNaN(numWage) || numWage <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Daily wage must be a valid positive number',
        });
      }
      workEntry.dailyWage = numWage;
    }

    if (remarks !== undefined) {
      workEntry.remarks = remarks ? remarks.trim() : '';
    }

    workEntry.isEdited = true;
    workEntry.lastUpdatedBy = req.user._id;
    workEntry.editHistory.push({
      previousData,
      updatedData: {
        date: workEntry.date,
        dailyWage: workEntry.dailyWage,
        remarks: workEntry.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: editReason || 'Work entry updated',
    });

    await workEntry.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: workEntry._id,
      module: 'TEMPORARY_STAFF_WORK',
      entryCode: workEntry.entryCode || '',
      action: 'EDIT',
      originalData: previousData,
      updatedData: {
        date: workEntry.date,
        dailyWage: workEntry.dailyWage,
        remarks: workEntry.remarks,
      },
      reason: editReason || 'Work entry updated',
    });

    const populated = await TemporaryStaffWork.findById(workEntry._id)
      .populate('staff', 'name mobile status entryCode')
      .populate('enteredBy', 'name role')
      .populate('lastUpdatedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Work entry updated successfully',
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This staff already has a work entry for this date.',
      });
    }
    console.error('Error in updateWorkEntry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update work entry',
      error: error.message,
    });
  }
};

/**
 * @desc Delete a work entry
 * @route DELETE /api/temporary-staff/work/:id
 */
const deleteWorkEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const workEntry = await TemporaryStaffWork.findById(id);

    if (!workEntry) {
      return res.status(404).json({
        success: false,
        message: 'Work entry not found',
      });
    }

    await TemporaryStaffWork.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Work entry deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteWorkEntry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete work entry',
      error: error.message,
    });
  }
};

// =========================================================================
// 3. SUMMARY & TOTAL PAYABLE CALCULATION (MONTHLY & DATE-RANGE)
// =========================================================================

/**
 * @desc Calculate days worked, total payable, and payment status for staff
 * @route GET /api/temporary-staff/summary
 */
const getTemporaryStaffSummary = async (req, res) => {
  try {
    const { month, startDate, endDate, staffId } = req.query;

    let dateQuery = {};
    let activeMonthStr = '';
    let startD, endD;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const bounds = getMonthBounds(month);
      startD = bounds.startOfMonth;
      endD = bounds.endOfMonth;
      activeMonthStr = bounds.formattedMonth;
    } else if (startDate || endDate) {
      if (startDate) startD = normalizeDate(startDate);
      else {
        startD = new Date();
        startD.setDate(1);
        startD.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
      } else {
        endD = new Date();
        endD.setHours(23, 59, 59, 999);
      }
    } else {
      const bounds = getMonthBounds();
      startD = bounds.startOfMonth;
      endD = bounds.endOfMonth;
      activeMonthStr = bounds.formattedMonth;
    }

    dateQuery = { date: { $gte: startD, $lte: endD } };

    // Enforce 45-day limit for managers if applicable
    enforce45DayLimit(req, dateQuery);

    // Staff filter
    const staffFilter = {};
    if (staffId && staffId !== 'all') {
      staffFilter._id = staffId;
    }

    const allStaff = await TemporaryStaff.find(staffFilter).sort({ status: 1, name: 1 });

    // Fetch all work entries in date range
    const workFilter = { ...dateQuery };
    if (staffId && staffId !== 'all') {
      workFilter.staff = staffId;
    }
    const workEntries = await TemporaryStaffWork.find(workFilter).sort({ date: 1 });

    // Fetch payment records for the period/month
    const paymentFilter = {};
    if (activeMonthStr) {
      paymentFilter.paymentMonth = activeMonthStr;
    } else {
      paymentFilter.paymentDate = { $gte: startD, $lte: endD };
    }
    if (staffId && staffId !== 'all') {
      paymentFilter.staff = staffId;
    }
    const paymentRecords = await TemporaryStaffPayment.find(paymentFilter);

    // Map work entries & payments by staff ID
    const workByStaff = {};
    workEntries.forEach((w) => {
      const sId = w.staff.toString();
      if (!workByStaff[sId]) workByStaff[sId] = [];
      workByStaff[sId].push(w);
    });

    const paymentsByStaff = {};
    paymentRecords.forEach((p) => {
      const sId = p.staff.toString();
      if (!paymentsByStaff[sId]) paymentsByStaff[sId] = 0;
      paymentsByStaff[sId] += p.paidAmount || 0;
    });

    // Build staff-wise summary
    let totalAllDays = 0;
    let totalAllPayable = 0;
    let totalAllPaid = 0;

    const summaryList = allStaff.map((staff) => {
      const sId = staff._id.toString();
      const staffWork = workByStaff[sId] || [];
      const daysWorked = staffWork.length;
      const totalPayable = staffWork.reduce((sum, item) => sum + (item.dailyWage || 0), 0);
      const totalPaid = paymentsByStaff[sId] || 0;
      const pendingBalance = Math.max(0, totalPayable - totalPaid);

      let status = 'Pending';
      if (totalPayable > 0) {
        if (totalPaid >= totalPayable) {
          status = 'Paid';
        } else if (totalPaid > 0) {
          status = 'Partially Paid';
        }
      } else {
        status = totalPaid > 0 ? 'Paid' : 'Pending';
      }

      totalAllDays += daysWorked;
      totalAllPayable += totalPayable;
      totalAllPaid += totalPaid;

      return {
        staff: {
          _id: staff._id,
          name: staff.name,
          mobile: staff.mobile,
          status: staff.status,
          entryCode: staff.entryCode,
        },
        daysWorked,
        totalPayable,
        totalPaid,
        pendingBalance,
        status,
        workDates: staffWork.map((w) => ({
          _id: w._id,
          date: w.date,
          dailyWage: w.dailyWage,
          remarks: w.remarks,
        })),
      };
    });

    const activeStaffCount = allStaff.filter((s) => s.status === 'Active').length;
    const pendingPayouts = Math.max(0, totalAllPayable - totalAllPaid);

    return res.status(200).json({
      success: true,
      data: {
        summaryList,
        metrics: {
          activeStaffCount,
          totalStaffCount: allStaff.length,
          totalDaysWorked: totalAllDays,
          totalPayable: totalAllPayable,
          totalPaid: totalAllPaid,
          pendingPayouts,
        },
        period: {
          month: activeMonthStr,
          startDate: startD,
          endDate: endD,
        },
      },
    });
  } catch (error) {
    console.error('Error in getTemporaryStaffSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to calculate temporary staff summary',
      error: error.message,
    });
  }
};

// =========================================================================
// 4. PAYMENT RECORD & HISTORY
// =========================================================================

/**
 * @desc Get temporary staff payment records
 * @route GET /api/temporary-staff/payments
 */
const getPayments = async (req, res) => {
  try {
    const { staffId, month, startDate, endDate, status, page, limit } = req.query;
    const filter = {};

    if (staffId && staffId !== 'all') {
      filter.staff = staffId;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      filter.paymentMonth = month;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = normalizeDate(startDate);
      if (endDate) {
        const endD = new Date(endDate);
        endD.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = endD;
      }
    }

    enforce45DayLimit(req, filter);

    const { pageNum, limitNum, skip } = getPagination(page, limit || 50);

    const [payments, total] = await Promise.all([
      TemporaryStaffPayment.find(filter)
        .populate('staff', 'name mobile status entryCode')
        .populate('paidBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      TemporaryStaffPayment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Error in getPayments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment records',
      error: error.message,
    });
  }
};

/**
 * @desc Record a payment payout to temporary staff
 * @route POST /api/temporary-staff/payments
 */
const createPayment = async (req, res) => {
  try {
    const {
      staffId,
      paymentMonth,
      startDate,
      endDate,
      daysWorked,
      payableAmount,
      paidAmount,
      paymentDate,
      paymentMode,
      remarks,
    } = req.body;

    if (!staffId) {
      return res.status(400).json({
        success: false,
        message: 'Temporary staff reference is required',
      });
    }

    const staff = await TemporaryStaff.findById(staffId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Temporary staff not found',
      });
    }

    const numPayable = Number(payableAmount);
    const numPaid = Number(paidAmount);

    if (isNaN(numPaid) || numPaid <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Paid amount must be a positive number greater than 0',
      });
    }

    if (isNaN(numPayable) || numPayable < 0) {
      return res.status(400).json({
        success: false,
        message: 'Payable amount must be a valid non-negative number',
      });
    }

    let pDate = paymentDate ? new Date(paymentDate) : new Date();

    // Validate payment date (future date, 45-day rule, date lock)
    const dateValidation = await validateDateAccess({ dateValue: pDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    // Determine Status
    let status = 'Paid';
    if (numPayable > 0) {
      if (numPaid >= numPayable) {
        status = 'Paid';
      } else {
        status = 'Partially Paid';
      }
    }

    const entryCode = generateEntryCode('TPM', pDate);

    const payment = await TemporaryStaffPayment.create({
      staff: staffId,
      paymentMonth: paymentMonth || '',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      daysWorked: Number(daysWorked) || 0,
      payableAmount: numPayable,
      paidAmount: numPaid,
      paymentDate: pDate,
      paymentMode: paymentMode || 'Cash',
      remarks: remarks ? remarks.trim() : '',
      paidBy: req.user._id,
      status,
      entryCode,
    });

    const populated = await TemporaryStaffPayment.findById(payment._id)
      .populate('staff', 'name mobile status entryCode')
      .populate('paidBy', 'name role');

    return res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Error in createPayment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message,
    });
  }
};

// =========================================================================
// 5. STAFF 360 PROFILE & FULL HISTORY
// =========================================================================

/**
 * @desc Get complete profile and history for a single temporary staff
 * @route GET /api/temporary-staff/profile/:id
 */
const getStaffProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const staff = await TemporaryStaff.findById(id)
      .populate('enteredBy', 'name role')
      .populate('lastUpdatedBy', 'name role');

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Temporary staff not found',
      });
    }

    // Work filter with 45-day rule if manager
    const workFilter = { staff: id };
    enforce45DayLimit(req, workFilter);

    const [workEntries, payments] = await Promise.all([
      TemporaryStaffWork.find(workFilter)
        .populate('enteredBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .sort({ date: -1 }),
      TemporaryStaffPayment.find({ staff: id })
        .populate('paidBy', 'name role')
        .sort({ paymentDate: -1 }),
    ]);

    // Group work entries by month YYYY-MM
    const monthlyMap = {};
    let lifetimePayable = 0;

    workEntries.forEach((entry) => {
      const d = new Date(entry.date);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[mStr]) {
        monthlyMap[mStr] = {
          month: mStr,
          daysWorked: 0,
          totalPayable: 0,
          entries: [],
        };
      }
      monthlyMap[mStr].daysWorked += 1;
      monthlyMap[mStr].totalPayable += entry.dailyWage || 0;
      monthlyMap[mStr].entries.push(entry);

      lifetimePayable += entry.dailyWage || 0;
    });

    const lifetimePaid = payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const balanceRemaining = Math.max(0, lifetimePayable - lifetimePaid);

    const monthlyBreakdown = Object.values(monthlyMap).sort((a, b) => b.month.localeCompare(a.month));

    return res.status(200).json({
      success: true,
      data: {
        staff,
        totals: {
          lifetimeDaysWorked: workEntries.length,
          lifetimePayable,
          lifetimePaid,
          balanceRemaining,
        },
        monthlyBreakdown,
        workEntries,
        paymentHistory: payments,
      },
    });
  } catch (error) {
    console.error('Error in getStaffProfile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch temporary staff profile',
      error: error.message,
    });
  }
};

module.exports = {
  getTemporaryStaffList,
  createTemporaryStaff,
  updateTemporaryStaff,
  getWorkEntries,
  createWorkEntry,
  updateWorkEntry,
  deleteWorkEntry,
  getTemporaryStaffSummary,
  getPayments,
  createPayment,
  getStaffProfile,
};
