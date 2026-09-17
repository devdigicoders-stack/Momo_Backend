const Expense = require('../models/Expense');
const { ExpenseCategory } = require('../models/ExpenseCategory');
const fs = require('fs');
const path = require('path');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess, apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Create an Expense entry
// @route   POST /api/expenses
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createExpense = async (req, res) => {
  try {
    const { date, category, subcategory, item, amount, paymentMode, remarks } = req.body;

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

    if (!category || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Expense category is required',
      });
    }

    const finalItem = (item && item.trim()) ? item.trim() : category.trim();

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Expense amount must be a valid positive number',
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
    const duplicate = await Expense.findOne({
      enteredBy: req.user._id,
      category: category.trim(),
      amount: numAmount,
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This expense voucher was already recorded a moment ago.',
      });
    }

    let billPath = null;
    if (req.file) {
      billPath = `/uploads/bills/${req.file.filename}`;
    }

    const entryCode = generateEntryCode('EXP', targetDate);

    const expense = await Expense.create({
      date: targetDate,
      category: category.trim(),
      subcategory: subcategory ? subcategory.trim() : '',
      item: finalItem,
      amount: numAmount,
      paymentMode: paymentMode.trim(),
      bill: billPath,
      remarks: remarks || '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populatedExpense = await Expense.findById(expense._id).populate(
      'enteredBy',
      'name email mobile role'
    );

    return res.status(201).json({
      success: true,
      message: 'Expense entry recorded successfully',
      data: populatedExpense,
    });
  } catch (error) {
    console.error('Create expense error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while recording expense',
    });
  }
};

// @desc    Get all Expense entries (Search, Filter, Sort, Pagination)
// @route   GET /api/expenses
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAllExpenses = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      paymentMode,
      datePreset,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    } = req.query;

    const filter = {};

    // 1. Date filter with 45-day query limit for managers
    const dateQuery = buildDateFilter(datePreset, fromDate, toDate);
    if (dateQuery) {
      filter.date = dateQuery;
    }
    apply45DayQueryLimit(req, filter, 'date');

    // 2. Category & Subcategory
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;

    // 3. Payment Mode
    if (paymentMode) filter.paymentMode = paymentMode;

    // 4. Search item, remarks, or entryCode
    if (search && search.trim()) {
      filter.$or = [
        { item: { $regex: search.trim(), $options: 'i' } },
        { remarks: { $regex: search.trim(), $options: 'i' } },
        { entryCode: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // 5. Sorting
    let sortOptions = { date: -1, createdAt: -1 };
    if (sortBy === 'amount') {
      sortOptions = { amount: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'item') {
      sortOptions = { item: sortOrder === 'desc' ? -1 : 1 };
    } else if (sortBy === 'oldest') {
      sortOptions = { date: 1, createdAt: 1 };
    } else if (sortBy === 'newest') {
      sortOptions = { date: -1, createdAt: -1 };
    }

    // 6. Pagination
    const { page, limit, skip } = getPagination(req.query);
    const total = await Expense.countDocuments(filter);

    const expenses = await Expense.find(filter)
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
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error('Get all expenses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching expenses',
    });
  }
};

// @desc    Get single Expense by ID
// @route   GET /api/expenses/:id
// @access  Private
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense record not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    console.error('Get expense by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving expense',
    });
  }
};

// @desc    Update Expense entry (Tracks edit history & accountability)
// @route   PUT /api/expenses/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateExpense = async (req, res) => {
  try {
    const { date, category, subcategory, item, amount, paymentMode, remarks, reason } = req.body;

    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense record not found',
      });
    }

    // Check Date Access (Future date, 45-day rule, Date Lock) on original and new date
    const check1 = await validateDateAccess({ dateValue: expense.date, user: req.user, allowFuture: false });
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
      date: expense.date,
      category: expense.category,
      subcategory: expense.subcategory,
      item: expense.item,
      amount: expense.amount,
      paymentMode: expense.paymentMode,
      remarks: expense.remarks,
      bill: expense.bill,
    };

    if (amount !== undefined) {
      if (Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Expense amount must be greater than 0',
        });
      }
      expense.amount = Number(amount);
    }

    if (date) expense.date = date;
    if (category) expense.category = category.trim();
    if (subcategory !== undefined) expense.subcategory = subcategory.trim();
    if (item) expense.item = item.trim();
    if (paymentMode) expense.paymentMode = paymentMode;
    if (remarks !== undefined) expense.remarks = remarks;

    if (req.file) {
      expense.bill = `/uploads/bills/${req.file.filename}`;
    }

    expense.isEdited = true;
    expense.lastUpdatedBy = req.user._id;
    if (!expense.entryCode) {
      expense.entryCode = generateEntryCode('EXP', expense.date);
    }

    expense.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: expense.date,
        category: expense.category,
        subcategory: expense.subcategory,
        item: expense.item,
        amount: expense.amount,
        paymentMode: expense.paymentMode,
        remarks: expense.remarks,
        bill: expense.bill,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: reason || 'Operational correction',
    });

    await expense.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: expense._id,
      module: 'EXPENSE',
      entryCode: expense.entryCode,
      action: 'EDIT',
      originalData: previousSnapshot,
      updatedData: {
        date: expense.date,
        category: expense.category,
        subcategory: expense.subcategory,
        item: expense.item,
        amount: expense.amount,
        paymentMode: expense.paymentMode,
        remarks: expense.remarks,
        bill: expense.bill,
      },
      reason: reason || 'Operational correction',
    });

    const updatedExpense = await Expense.findById(expense._id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Expense updated successfully',
      data: updatedExpense,
    });
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating expense',
    });
  }
};

// @desc    Delete Expense entry
// @route   DELETE /api/expenses/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense record not found',
      });
    }

    // Check Date Access (45-day rule & Date Lock)
    const dateCheck = await validateDateAccess({ dateValue: expense.date, user: req.user, allowFuture: false });
    if (!dateCheck.isValid) {
      return res.status(dateCheck.status).json({ success: false, message: dateCheck.message });
    }

    if (expense.bill) {
      const filePath = path.join(__dirname, '../../', expense.bill);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: expense._id,
      module: 'EXPENSE',
      entryCode: expense.entryCode,
      action: 'DELETE',
      originalData: {
        date: expense.date,
        category: expense.category,
        subcategory: expense.subcategory,
        item: expense.item,
        amount: expense.amount,
        paymentMode: expense.paymentMode,
        remarks: expense.remarks,
      },
      reason: req.body?.reason || 'Record deleted',
    });

    await Expense.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Expense record deleted successfully',
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting expense',
    });
  }
};
