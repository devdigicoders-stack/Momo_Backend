const Sales = require('../models/Sales');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess, apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Create a new Sales entry
// @route   POST /api/sales
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.createSales = async (req, res) => {
  try {
    const { date, amount, paymentMode, remarks } = req.body;

    const targetDate = date || Date.now();

    // Validate Future Date, 45-Day boundary, and Date Lock
    const dateValidation = await validateDateAccess({
      dateValue: targetDate,
      user: req.user,
      allowFuture: false,
    });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({
        success: false,
        message: dateValidation.message,
      });
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Sales amount must be a valid positive number',
      });
    }

    if (!paymentMode || !paymentMode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Payment mode is required',
      });
    }

    // Duplicate submission guard (within 5 seconds)
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await Sales.findOne({
      enteredBy: req.user._id,
      amount: numAmount,
      paymentMode: paymentMode.trim(),
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This sales record was already submitted a moment ago.',
      });
    }

    const entryCode = generateEntryCode('SAL', targetDate);

    const salesEntry = await Sales.create({
      date: targetDate,
      amount: numAmount,
      paymentMode: paymentMode.trim(),
      remarks: remarks || '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populatedEntry = await Sales.findById(salesEntry._id).populate(
      'enteredBy',
      'name email mobile role'
    );

    return res.status(201).json({
      success: true,
      message: 'Sales entry recorded successfully',
      data: populatedEntry,
    });
  } catch (error) {
    console.error('Create sales error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating sales entry',
    });
  }
};

// @desc    Get all Sales entries (Search, Filter, Sort, Pagination)
// @route   GET /api/sales
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.getAllSales = async (req, res) => {
  try {
    const { search, paymentMode, datePreset, fromDate, toDate, sortBy, sortOrder } = req.query;
    const filter = {};

    // 1. Date filter with 45-day query limit for managers
    const dateQuery = buildDateFilter(datePreset, fromDate, toDate);
    if (dateQuery) {
      filter.date = dateQuery;
    }
    apply45DayQueryLimit(req, filter, 'date');

    // 2. Payment Mode
    if (paymentMode) {
      filter.paymentMode = paymentMode;
    }

    // 3. Search remarks or entryCode
    if (search && search.trim()) {
      filter.$or = [
        { remarks: { $regex: search.trim(), $options: 'i' } },
        { entryCode: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // 4. Sorting
    let sortOptions = { date: -1, createdAt: -1 };
    if (sortBy === 'amount') {
      sortOptions = { amount: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'oldest') {
      sortOptions = { date: 1, createdAt: 1 };
    } else if (sortBy === 'newest') {
      sortOptions = { date: -1, createdAt: -1 };
    }

    // 5. Pagination
    const { page, limit, skip } = getPagination(req.query);
    const total = await Sales.countDocuments(filter);

    const sales = await Sales.find(filter)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      count: sales.length,
      data: sales,
    });
  } catch (error) {
    console.error('Get all sales error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching sales records',
    });
  }
};

// @desc    Get single Sales entry by ID
// @route   GET /api/sales/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.getSalesById = async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sales record not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: sale,
    });
  } catch (error) {
    console.error('Get sales by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving sales record',
    });
  }
};

// @desc    Update a Sales entry (Tracks edit history & accountability)
// @route   PUT /api/sales/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.updateSales = async (req, res) => {
  try {
    const { date, amount, paymentMode, remarks, reason } = req.body;

    const sale = await Sales.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sales record not found',
      });
    }

    // Check Date Access (Future date, 45-day rule, Date Lock) on original and target date
    const check1 = await validateDateAccess({ dateValue: sale.date, user: req.user, allowFuture: false });
    if (!check1.isValid) {
      return res.status(check1.status).json({ success: false, message: check1.message });
    }
    if (date) {
      const check2 = await validateDateAccess({ dateValue: date, user: req.user, allowFuture: false });
      if (!check2.isValid) {
        return res.status(check2.status).json({ success: false, message: check2.message });
      }
    }

    // Capture previous snapshot
    const previousSnapshot = {
      date: sale.date,
      amount: sale.amount,
      paymentMode: sale.paymentMode,
      remarks: sale.remarks,
    };

    if (amount !== undefined) {
      if (Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Sales amount must be greater than 0',
        });
      }
      sale.amount = Number(amount);
    }

    if (date) sale.date = date;
    if (paymentMode) sale.paymentMode = paymentMode;
    if (remarks !== undefined) sale.remarks = remarks;

    sale.isEdited = true;
    sale.lastUpdatedBy = req.user._id;
    if (!sale.entryCode) {
      sale.entryCode = generateEntryCode('SAL', sale.date);
    }

    sale.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: sale.date,
        amount: sale.amount,
        paymentMode: sale.paymentMode,
        remarks: sale.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: reason || 'Operational correction',
    });

    await sale.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: sale._id,
      module: 'SALES',
      entryCode: sale.entryCode,
      action: 'EDIT',
      originalData: previousSnapshot,
      updatedData: {
        date: sale.date,
        amount: sale.amount,
        paymentMode: sale.paymentMode,
        remarks: sale.remarks,
      },
      reason: reason || 'Operational correction',
    });

    const updatedSale = await Sales.findById(sale._id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Sales entry updated successfully',
      data: updatedSale,
    });
  } catch (error) {
    console.error('Update sales error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating sales entry',
    });
  }
};

// @desc    Delete a Sales entry
// @route   DELETE /api/sales/:id
// @access  Private (SUPER_ADMIN ONLY)
exports.deleteSales = async (req, res) => {
  try {
    const sale = await Sales.findById(req.params.id);
    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sales record not found',
      });
    }

    // Check Date Access (45-day rule & Date Lock)
    const dateCheck = await validateDateAccess({ dateValue: sale.date, user: req.user, allowFuture: false });
    if (!dateCheck.isValid) {
      return res.status(dateCheck.status).json({ success: false, message: dateCheck.message });
    }

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: sale._id,
      module: 'SALES',
      entryCode: sale.entryCode,
      action: 'DELETE',
      originalData: {
        date: sale.date,
        amount: sale.amount,
        paymentMode: sale.paymentMode,
        remarks: sale.remarks,
      },
      reason: req.body?.reason || 'Record deleted',
    });

    await Sales.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Sales record deleted successfully',
    });
  } catch (error) {
    console.error('Delete sales error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting sales record',
    });
  }
};
