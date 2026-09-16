const CashEntry = require('../models/CashEntry');
const AdditionalCash = require('../models/AdditionalCash');
const CashDeposit = require('../models/CashDeposit');
const Sales = require('../models/Sales');
const Expense = require('../models/Expense');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess } = require('../middleware/accessControl.middleware');

/**
 * Helper: compute date boundaries
 */
const getDayBoundaries = (dateStr) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const startOfDay = new Date(d);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay, formattedDate: startOfDay.toISOString().split('T')[0] };
};

/**
 * Helper: enforce 45-day rule for managers
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
    } else {
      queryFilter.date = { $gte: fortyFiveDaysAgo };
    }
  }
};

// ==========================================
// 1. CASH CALCULATION & SUMMARY APIS
// ==========================================

// @desc    Get Date-Wise Cash Summary & Live Calculation
// @route   GET /api/cash/summary
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getCashSummary = async (req, res) => {
  try {
    const { date } = req.query;
    const { startOfDay, endOfDay, formattedDate } = getDayBoundaries(date);

    // 1. Prior Cash Calculations (for Opening Cash)
    const [priorSalesCash, priorAdditionalCash, priorExpenseCash, priorDeposits] = await Promise.all([
      Sales.aggregate([
        { $match: { date: { $lt: startOfDay }, paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      AdditionalCash.aggregate([
        { $match: { date: { $lt: startOfDay }, status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { date: { $lt: startOfDay }, paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CashDeposit.aggregate([
        { $match: { date: { $lt: startOfDay }, status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const priorInflow = (priorSalesCash[0]?.total || 0) + (priorAdditionalCash[0]?.total || 0);
    const priorOutflow = (priorExpenseCash[0]?.total || 0) + (priorDeposits[0]?.total || 0);
    const openingCash = Math.max(0, priorInflow - priorOutflow);

    // 2. Target Date Cash Calculations
    const [todaySalesCash, todayAdditionalCash, todayExpenseCash, todayDeposits] = await Promise.all([
      Sales.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay }, paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      AdditionalCash.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay }, status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay }, paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      CashDeposit.aggregate([
        { $match: { date: { $gte: startOfDay, $lte: endOfDay }, status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const cashCollection = todaySalesCash[0]?.total || 0;
    const additionalCash = todayAdditionalCash[0]?.total || 0;
    const cashExpenses = todayExpenseCash[0]?.total || 0;
    const cashDeposit = todayDeposits[0]?.total || 0;

    const closingCash = openingCash + cashCollection + additionalCash - cashExpenses - cashDeposit;

    // 3. Overall Available Cash (All-time dynamic balance)
    const [allTimeSalesCash, allTimeAdditional, allTimeExpenseCash, allTimeDeposits] = await Promise.all([
      Sales.aggregate([
        { $match: { paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      AdditionalCash.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CashDeposit.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalInflow = (allTimeSalesCash[0]?.total || 0) + (allTimeAdditional[0]?.total || 0);
    const totalOutflow = (allTimeExpenseCash[0]?.total || 0) + (allTimeDeposits[0]?.total || 0);
    const availableCash = Math.max(0, totalInflow - totalOutflow);

    return res.status(200).json({
      success: true,
      data: {
        date: formattedDate,
        openingCash,
        cashCollection,
        additionalCash,
        cashExpenses,
        cashDeposit,
        closingCash,
        availableCash,
        counts: {
          salesCashEntries: todaySalesCash[0]?.count || 0,
          additionalCashEntries: todayAdditionalCash[0]?.count || 0,
          expenseCashEntries: todayExpenseCash[0]?.count || 0,
          depositEntries: todayDeposits[0]?.count || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get cash summary error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while computing cash summary',
    });
  }
};

// @desc    Get Current Live Available Cash
// @route   GET /api/cash/available
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAvailableCash = async (req, res) => {
  try {
    const [allTimeSalesCash, allTimeAdditional, allTimeExpenseCash, allTimeDeposits] = await Promise.all([
      Sales.aggregate([
        { $match: { paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      AdditionalCash.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Expense.aggregate([
        { $match: { paymentMode: 'Cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CashDeposit.aggregate([
        { $match: { status: 'ACTIVE' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalInflow = (allTimeSalesCash[0]?.total || 0) + (allTimeAdditional[0]?.total || 0);
    const totalOutflow = (allTimeExpenseCash[0]?.total || 0) + (allTimeDeposits[0]?.total || 0);
    const availableCash = Math.max(0, totalInflow - totalOutflow);

    return res.status(200).json({
      success: true,
      data: {
        availableCash,
        totalInflow,
        totalOutflow,
      },
    });
  } catch (error) {
    console.error('Get available cash error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve available cash',
    });
  }
};

// ==========================================
// 2. ADDITIONAL CASH RECEIVED APIS
// ==========================================

// @desc    Create Additional Cash entry
// @route   POST /api/cash/additional
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createAdditionalCash = async (req, res) => {
  try {
    const { date, amount, reason, providedBy, remarks } = req.body;
    const targetDate = date ? new Date(date) : new Date();

    // Date Validation (Future Date, 45-day rule, Date Lock)
    const dateValidation = await validateDateAccess({ dateValue: targetDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason for additional cash is required' });
    }

    if (!providedBy || !providedBy.trim()) {
      return res.status(400).json({ success: false, message: 'Cash provider / source is required' });
    }

    // 5-second duplicate submission guard
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await AdditionalCash.findOne({
      enteredBy: req.user._id,
      amount: numAmount,
      reason: reason.trim(),
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This additional cash entry was just recorded.',
      });
    }

    const entryCode = generateEntryCode('ADC', targetDate);

    const newEntry = await AdditionalCash.create({
      date: targetDate,
      amount: numAmount,
      reason: reason.trim(),
      providedBy: providedBy.trim(),
      remarks: remarks ? remarks.trim() : '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await AdditionalCash.findById(newEntry._id).populate('enteredBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Additional cash received recorded successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Create additional cash error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while recording additional cash',
    });
  }
};

// @desc    Get Additional Cash entries (Filters, 45-day rule, Pagination)
// @route   GET /api/cash/additional
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAdditionalCashList = async (req, res) => {
  try {
    const { date, startDate, endDate, search, page = 1, limit = 10 } = req.query;
    let queryFilter = { status: 'ACTIVE' };

    const dateFilter = buildDateFilter(date, startDate, endDate);
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      queryFilter = { ...queryFilter, ...dateFilter };
    }

    enforce45DayLimit(req, queryFilter);

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      queryFilter.$or = [
        { reason: searchRegex },
        { providedBy: searchRegex },
        { remarks: searchRegex },
        { entryCode: searchRegex },
      ];
    }

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [entries, total] = await Promise.all([
      AdditionalCash.find(queryFilter)
        .populate('enteredBy', 'name email role')
        .populate('lastUpdatedBy', 'name email role')
        .populate('editHistory.editedBy', 'name email role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      AdditionalCash.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get additional cash list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve additional cash records' });
  }
};

// @desc    Get single Additional Cash by ID
// @route   GET /api/cash/additional/:id
// @access  Private
exports.getAdditionalCashById = async (req, res) => {
  try {
    const entry = await AdditionalCash.findById(req.params.id)
      .populate('enteredBy', 'name email role')
      .populate('lastUpdatedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role');

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Additional cash record not found' });
    }

    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Additional Cash record
// @route   PUT /api/cash/additional/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateAdditionalCash = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, amount, reason, providedBy, remarks, editReason } = req.body;

    const existing = await AdditionalCash.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Additional cash record not found' });
    }

    // Date Validation (Future Date, 45-day rule, Date Lock)
    const check1 = await validateDateAccess({ dateValue: existing.date, user: req.user, allowFuture: false });
    if (!check1.isValid) {
      return res.status(check1.status).json({ success: false, message: check1.message });
    }
    if (date) {
      const check2 = await validateDateAccess({ dateValue: date, user: req.user, allowFuture: false });
      if (!check2.isValid) {
        return res.status(check2.status).json({ success: false, message: check2.message });
      }
    }

    const previousSnapshot = {
      date: existing.date,
      amount: existing.amount,
      reason: existing.reason,
      providedBy: existing.providedBy,
      remarks: existing.remarks,
    };

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
      }
      existing.amount = numAmount;
    }

    if (date) existing.date = new Date(date);
    if (reason) existing.reason = reason.trim();
    if (providedBy) existing.providedBy = providedBy.trim();
    if (remarks !== undefined) existing.remarks = remarks.trim();

    existing.isEdited = true;
    existing.lastUpdatedBy = req.user._id;
    existing.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: existing.date,
        amount: existing.amount,
        reason: existing.reason,
        providedBy: existing.providedBy,
        remarks: existing.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: editReason || 'Correction of additional cash record',
    });

    await existing.save();

    const updated = await AdditionalCash.findById(id)
      .populate('enteredBy', 'name email role')
      .populate('lastUpdatedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role');

    return res.status(200).json({
      success: true,
      message: 'Additional cash record updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update additional cash error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update additional cash record' });
  }
};

// ==========================================
// 3. CASH DEPOSIT APIS
// ==========================================

// @desc    Create Cash Deposit entry (with file upload)
// @route   POST /api/cash/deposit
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createCashDeposit = async (req, res) => {
  try {
    const { date, amount, bank, account, remarks } = req.body;
    const targetDate = date ? new Date(date) : new Date();

    // Date Validation (Future Date, 45-day rule, Date Lock)
    const dateValidation = await validateDateAccess({ dateValue: targetDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive deposit amount is required' });
    }

    if (!bank || !bank.trim()) {
      return res.status(400).json({ success: false, message: 'Bank name is required' });
    }

    if (!account || !account.trim()) {
      return res.status(400).json({ success: false, message: 'Account identifier is required' });
    }

    // 5-second duplicate submission guard
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await CashDeposit.findOne({
      enteredBy: req.user._id,
      amount: numAmount,
      bank: bank.trim(),
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This bank deposit was just recorded.',
      });
    }

    const entryCode = generateEntryCode('DEP', targetDate);
    const depositSlipPath = req.file ? `/uploads/deposits/${req.file.filename}` : null;

    const newDeposit = await CashDeposit.create({
      date: targetDate,
      amount: numAmount,
      bank: bank.trim(),
      account: account.trim(),
      depositSlip: depositSlipPath,
      remarks: remarks ? remarks.trim() : '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await CashDeposit.findById(newDeposit._id).populate('enteredBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Bank cash deposit recorded successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Create cash deposit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while recording cash deposit',
    });
  }
};

// @desc    Get Cash Deposits (Filters, 45-day rule, Pagination)
// @route   GET /api/cash/deposit
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getCashDepositList = async (req, res) => {
  try {
    const { date, startDate, endDate, bank, search, page = 1, limit = 10 } = req.query;
    let queryFilter = { status: 'ACTIVE' };

    const dateFilter = buildDateFilter(date, startDate, endDate);
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      queryFilter = { ...queryFilter, ...dateFilter };
    }

    enforce45DayLimit(req, queryFilter);

    if (bank && bank.trim()) {
      queryFilter.bank = new RegExp(bank.trim(), 'i');
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      queryFilter.$or = [
        { bank: searchRegex },
        { account: searchRegex },
        { remarks: searchRegex },
        { entryCode: searchRegex },
      ];
    }

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [deposits, total] = await Promise.all([
      CashDeposit.find(queryFilter)
        .populate('enteredBy', 'name email role')
        .populate('lastUpdatedBy', 'name email role')
        .populate('editHistory.editedBy', 'name email role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      CashDeposit.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: deposits,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get cash deposits list error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve deposit records' });
  }
};

// @desc    Get single Cash Deposit by ID
// @route   GET /api/cash/deposit/:id
// @access  Private
exports.getCashDepositById = async (req, res) => {
  try {
    const deposit = await CashDeposit.findById(req.params.id)
      .populate('enteredBy', 'name email role')
      .populate('lastUpdatedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role');

    if (!deposit) {
      return res.status(404).json({ success: false, message: 'Cash deposit record not found' });
    }

    return res.status(200).json({ success: true, data: deposit });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Cash Deposit record
// @route   PUT /api/cash/deposit/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateCashDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, amount, bank, account, remarks, editReason } = req.body;

    const existing = await CashDeposit.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Cash deposit record not found' });
    }

    // Date Validation (Future Date, 45-day rule, Date Lock)
    const check1 = await validateDateAccess({ dateValue: existing.date, user: req.user, allowFuture: false });
    if (!check1.isValid) {
      return res.status(check1.status).json({ success: false, message: check1.message });
    }
    if (date) {
      const check2 = await validateDateAccess({ dateValue: date, user: req.user, allowFuture: false });
      if (!check2.isValid) {
        return res.status(check2.status).json({ success: false, message: check2.message });
      }
    }

    const previousSnapshot = {
      date: existing.date,
      amount: existing.amount,
      bank: existing.bank,
      account: existing.account,
      depositSlip: existing.depositSlip,
      remarks: existing.remarks,
    };

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
      }
      existing.amount = numAmount;
    }

    if (date) existing.date = new Date(date);
    if (bank) existing.bank = bank.trim();
    if (account) existing.account = account.trim();
    if (remarks !== undefined) existing.remarks = remarks.trim();
    if (req.file) {
      existing.depositSlip = `/uploads/deposits/${req.file.filename}`;
    }

    existing.isEdited = true;
    existing.lastUpdatedBy = req.user._id;
    existing.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: existing.date,
        amount: existing.amount,
        bank: existing.bank,
        account: existing.account,
        depositSlip: existing.depositSlip,
        remarks: existing.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: editReason || 'Correction of cash deposit record',
    });

    await existing.save();

    const updated = await CashDeposit.findById(id)
      .populate('enteredBy', 'name email role')
      .populate('lastUpdatedBy', 'name email role')
      .populate('editHistory.editedBy', 'name email role');

    return res.status(200).json({
      success: true,
      message: 'Cash deposit updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update cash deposit error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update cash deposit' });
  }
};

// ==========================================
// 4. UNIFIED CASH TRANSACTION LEDGER
// ==========================================

// @desc    Get Unified Cash Transactions across all 4 streams
// @route   GET /api/cash/transactions
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getUnifiedTransactions = async (req, res) => {
  try {
    const { type, date, startDate, endDate, search, page = 1, limit = 15 } = req.query;
    const dateFilter = buildDateFilter(date, startDate, endDate);

    let baseFilter = {};
    if (dateFilter && typeof dateFilter === 'object' && Object.keys(dateFilter).length > 0) {
      baseFilter = { ...dateFilter };
    }

    enforce45DayLimit(req, baseFilter);

    const streams = [];

    // 1. Cash Sales stream (Only if user has Sales view permission)
    if (req.user.role !== 'MANAGER_2' && (!type || type === 'ALL' || type === 'COLLECTION')) {
      streams.push(
        Sales.find({ ...baseFilter, paymentMode: 'Cash' })
          .populate('enteredBy', 'name email role')
          .sort({ date: -1, createdAt: -1 })
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              date: i.date,
              type: 'Cash Collection',
              category: 'Sales Revenue',
              flow: 'IN',
              amount: i.amount,
              summary: 'Daily Cash Counter Sale',
              details: `Payment: Cash | Total Items: ${i.items?.length || 1}`,
              entryCode: i.entryCode || `SAL-${i._id.toString().substring(18)}`,
              enteredBy: i.enteredBy,
              isEdited: i.isEdited || false,
              editHistory: i.editHistory || [],
              raw: i,
              createdAt: i.createdAt,
            }))
          )
      );
    }

    // 2. Additional Cash stream
    if (!type || type === 'ALL' || type === 'ADDITIONAL') {
      streams.push(
        AdditionalCash.find({ ...baseFilter, status: 'ACTIVE' })
          .populate('enteredBy', 'name email role')
          .sort({ date: -1, createdAt: -1 })
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              date: i.date,
              type: 'Additional Cash',
              category: i.reason,
              flow: 'IN',
              amount: i.amount,
              summary: `Received from: ${i.providedBy}`,
              details: i.remarks || i.reason,
              entryCode: i.entryCode,
              enteredBy: i.enteredBy,
              isEdited: i.isEdited || false,
              editHistory: i.editHistory || [],
              raw: i,
              createdAt: i.createdAt,
            }))
          )
      );
    }

    // 3. Cash Expenses stream
    if (!type || type === 'ALL' || type === 'EXPENSE') {
      streams.push(
        Expense.find({ ...baseFilter, paymentMode: 'Cash' })
          .populate('enteredBy', 'name email role')
          .sort({ date: -1, createdAt: -1 })
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              date: i.date,
              type: 'Cash Expense',
              category: i.category,
              flow: 'OUT',
              amount: i.amount,
              summary: i.item || i.remarks || i.category,
              details: `Subcategory: ${i.subcategory || 'General'} | Paid: Cash`,
              entryCode: i.entryCode || `EXP-${i._id.toString().substring(18)}`,
              enteredBy: i.enteredBy,
              isEdited: i.isEdited || false,
              editHistory: i.editHistory || [],
              raw: i,
              createdAt: i.createdAt,
            }))
          )
      );
    }

    // 4. Cash Deposit stream
    if (!type || type === 'ALL' || type === 'DEPOSIT') {
      streams.push(
        CashDeposit.find({ ...baseFilter, status: 'ACTIVE' })
          .populate('enteredBy', 'name email role')
          .sort({ date: -1, createdAt: -1 })
          .then((items) =>
            items.map((i) => ({
              _id: i._id,
              date: i.date,
              type: 'Cash Deposit',
              category: 'Bank Deposit',
              flow: 'OUT',
              amount: i.amount,
              summary: `Deposited to: ${i.bank}`,
              details: `A/C: ${i.account} ${i.depositSlip ? '(Slip Attached)' : ''}`,
              depositSlip: i.depositSlip,
              entryCode: i.entryCode,
              enteredBy: i.enteredBy,
              isEdited: i.isEdited || false,
              editHistory: i.editHistory || [],
              raw: i,
              createdAt: i.createdAt,
            }))
          )
      );
    }

    const results = await Promise.all(streams);
    let flattened = results.flat();

    // Client-side text search across unified attributes
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      flattened = flattened.filter(
        (item) =>
          item.type.toLowerCase().includes(q) ||
          item.summary.toLowerCase().includes(q) ||
          (item.details && item.details.toLowerCase().includes(q)) ||
          (item.entryCode && item.entryCode.toLowerCase().includes(q)) ||
          (item.enteredBy?.name && item.enteredBy.name.toLowerCase().includes(q))
      );
    }

    // Sort descending by date and time
    flattened.sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 15;
    const startIndex = (pageNum - 1) * limitNum;
    const total = flattened.length;
    const paginatedItems = flattened.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error('Get unified transactions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve unified cash transactions' });
  }
};

// ==========================================
// 5. LEGACY / MANUAL SNAPSHOT APIS
// ==========================================

// @desc    Create manual daily Cash tally (Legacy compatibility)
// @route   POST /api/cash
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createCashEntry = async (req, res) => {
  try {
    const { date, openingCash, cashReceived, cashPaid, remarks } = req.body;
    const targetDate = date || Date.now();

    const dateValidation = await validateDateAccess({ dateValue: targetDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    const op = Number(openingCash);
    const rec = Number(cashReceived) || 0;
    const paid = Number(cashPaid) || 0;

    if (isNaN(op) || op < 0) {
      return res.status(400).json({ success: false, message: 'Valid opening cash is required' });
    }

    const calculatedClosing = op + rec - paid;
    const entryCode = generateEntryCode('CSH', targetDate);

    const cashEntry = await CashEntry.create({
      date: targetDate,
      openingCash: op,
      cashReceived: rec,
      cashPaid: paid,
      closingCash: calculatedClosing,
      remarks: remarks || '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populatedEntry = await CashEntry.findById(cashEntry._id).populate('enteredBy', 'name email mobile role');

    return res.status(201).json({
      success: true,
      message: 'Cash snapshot recorded successfully',
      data: populatedEntry,
    });
  } catch (error) {
    console.error('Create cash snapshot error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Get all Cash snapshot entries
// @route   GET /api/cash
// @access  Private
exports.getCashEntries = async (req, res) => {
  try {
    const { date, startDate, endDate, page = 1, limit = 10 } = req.query;
    let queryFilter = {};

    const dateFilter = buildDateFilter(date, startDate, endDate);
    if (Object.keys(dateFilter).length > 0) {
      queryFilter = { ...queryFilter, ...dateFilter };
    }

    enforce45DayLimit(req, queryFilter);

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [entries, total] = await Promise.all([
      CashEntry.find(queryFilter)
        .populate('enteredBy', 'name email role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      CashEntry.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: entries,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get single Cash snapshot entry
// @route   GET /api/cash/:id
// @access  Private
exports.getCashEntryById = async (req, res) => {
  try {
    const entry = await CashEntry.findById(req.params.id).populate('enteredBy', 'name email role');
    if (!entry) return res.status(404).json({ success: false, message: 'Record not found' });
    return res.status(200).json({ success: true, data: entry });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Cash snapshot entry
// @route   PUT /api/cash/:id
// @access  Private
exports.updateCashEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, openingCash, cashReceived, cashPaid, remarks, editReason } = req.body;

    const entry = await CashEntry.findById(id);
    if (!entry) return res.status(404).json({ success: false, message: 'Record not found' });

    const dateValidation = await validateDateAccess({ dateValue: entry.date, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    const previousData = {
      openingCash: entry.openingCash,
      cashReceived: entry.cashReceived,
      cashPaid: entry.cashPaid,
      closingCash: entry.closingCash,
      remarks: entry.remarks,
    };

    if (openingCash !== undefined) entry.openingCash = Number(openingCash);
    if (cashReceived !== undefined) entry.cashReceived = Number(cashReceived);
    if (cashPaid !== undefined) entry.cashPaid = Number(cashPaid);
    if (remarks !== undefined) entry.remarks = remarks;
    if (date) entry.date = date;

    entry.closingCash = entry.openingCash + entry.cashReceived - entry.cashPaid;
    entry.isEdited = true;
    entry.lastUpdatedBy = req.user._id;
    entry.editHistory.push({
      previousData,
      updatedData: {
        openingCash: entry.openingCash,
        cashReceived: entry.cashReceived,
        cashPaid: entry.cashPaid,
        closingCash: entry.closingCash,
        remarks: entry.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: editReason || 'Correction of cash snapshot',
    });

    await entry.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: entry._id,
      module: 'CASH',
      entryCode: entry.entryCode || '',
      action: 'EDIT',
      originalData: previousData,
      updatedData: {
        openingCash: entry.openingCash,
        cashReceived: entry.cashReceived,
        cashPaid: entry.cashPaid,
        closingCash: entry.closingCash,
        remarks: entry.remarks,
      },
      reason: editReason || 'Correction of cash snapshot',
    });

    const updated = await CashEntry.findById(id).populate('enteredBy', 'name email role');
    return res.status(200).json({ success: true, message: 'Record updated', data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
