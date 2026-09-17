const MomoPurchase = require('../models/MomoPurchase');
const MomoType = require('../models/MomoType');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess, apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Create new Momo Purchase entry
// @route   POST /api/momo-purchases
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createMomoPurchase = async (req, res) => {
  try {
    const { date, momoType, quantity, supplierName, paymentMode, remarks } = req.body;

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

    if (!momoType || !momoType.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Momo type is required',
      });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0',
      });
    }

    // Lookup predefined rate from MomoType collection
    const momoTypeDoc = await MomoType.findOne({ name: momoType.trim() });
    let itemRate = momoTypeDoc ? momoTypeDoc.defaultRate : Number(req.body.rate);

    if (isNaN(itemRate) || itemRate < 0) {
      itemRate = 0;
    }

    // Payment Quantity Rule: Pay for 90% of total momo quantity (e.g. 1,000 momos -> 900 momos)
    const payableQuantity = qty * 0.90;
    const calculatedTotal = Number((payableQuantity * itemRate).toFixed(2));

    // Duplicate submission guard (within 5 seconds)
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await MomoPurchase.findOne({
      enteredBy: req.user._id,
      momoType: momoType.trim(),
      quantity: qty,
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This purchase was already submitted a moment ago.',
      });
    }

    const entryCode = generateEntryCode('MOM', targetDate);

    const purchase = await MomoPurchase.create({
      date: targetDate,
      momoType: momoType.trim(),
      quantity: qty,
      rate: itemRate,
      totalAmount: calculatedTotal,
      supplierName: supplierName ? supplierName.trim() : '',
      paymentMode: paymentMode ? paymentMode.trim() : 'Cash',
      remarks: remarks || '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populatedPurchase = await MomoPurchase.findById(purchase._id).populate(
      'enteredBy',
      'name email mobile role'
    );

    return res.status(201).json({
      success: true,
      message: 'Momo purchase recorded successfully',
      data: populatedPurchase,
    });
  } catch (error) {
    console.error('Create momo purchase error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while recording momo purchase',
    });
  }
};

// @desc    Get all Momo Purchases (Search, Filter, Sort, Pagination)
// @route   GET /api/momo-purchases
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAllMomoPurchases = async (req, res) => {
  try {
    const {
      search,
      momoType,
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

    // 2. Momo Type & Payment Mode
    if (momoType) filter.momoType = momoType;
    if (paymentMode) filter.paymentMode = paymentMode;

    // 3. Search supplier, remarks, or entryCode
    if (search && search.trim()) {
      filter.$or = [
        { supplierName: { $regex: search.trim(), $options: 'i' } },
        { remarks: { $regex: search.trim(), $options: 'i' } },
        { entryCode: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // 4. Sorting
    let sortOptions = { date: -1, createdAt: -1 };
    if (sortBy === 'amount') {
      sortOptions = { totalAmount: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'quantity') {
      sortOptions = { quantity: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'oldest') {
      sortOptions = { date: 1, createdAt: 1 };
    } else if (sortBy === 'newest') {
      sortOptions = { date: -1, createdAt: -1 };
    }

    // 5. Pagination
    const { page, limit, skip } = getPagination(req.query);
    const total = await MomoPurchase.countDocuments(filter);

    const purchases = await MomoPurchase.find(filter)
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
      count: purchases.length,
      data: purchases,
    });
  } catch (error) {
    console.error('Get all momo purchases error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching momo purchases',
    });
  }
};

// @desc    Get single Momo Purchase by ID
// @route   GET /api/momo-purchases/:id
// @access  Private
exports.getMomoPurchaseById = async (req, res) => {
  try {
    const purchase = await MomoPurchase.findById(req.params.id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Momo purchase record not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: purchase,
    });
  } catch (error) {
    console.error('Get momo purchase by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving momo purchase',
    });
  }
};

// @desc    Update Momo Purchase (Tracks edit history & accountability)
// @route   PUT /api/momo-purchases/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateMomoPurchase = async (req, res) => {
  try {
    const { date, momoType, quantity, rate, totalAmount, supplierName, paymentMode, remarks, reason } = req.body;

    const purchase = await MomoPurchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Momo purchase record not found',
      });
    }

    // Check Date Access (Future date, 45-day rule, Date Lock) on original and new date
    const check1 = await validateDateAccess({ dateValue: purchase.date, user: req.user, allowFuture: false });
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
      date: purchase.date,
      momoType: purchase.momoType,
      quantity: purchase.quantity,
      rate: purchase.rate,
      totalAmount: purchase.totalAmount,
      supplierName: purchase.supplierName,
      paymentMode: purchase.paymentMode,
      remarks: purchase.remarks,
    };

    if (date) purchase.date = date;
    if (momoType) purchase.momoType = momoType.trim();
    if (quantity !== undefined) purchase.quantity = Number(quantity);
    if (rate !== undefined) purchase.rate = Number(rate);
    
    if (quantity !== undefined || rate !== undefined) {
      const q = quantity !== undefined ? Number(quantity) : purchase.quantity;
      const r = rate !== undefined ? Number(rate) : purchase.rate;
      purchase.totalAmount = totalAmount ? Number(totalAmount) : Number(((q * 0.90) * r).toFixed(2));
    } else if (totalAmount !== undefined) {
      purchase.totalAmount = Number(totalAmount);
    }

    if (supplierName !== undefined) purchase.supplierName = supplierName.trim();
    if (paymentMode) purchase.paymentMode = paymentMode;
    if (remarks !== undefined) purchase.remarks = remarks;

    purchase.isEdited = true;
    purchase.lastUpdatedBy = req.user._id;
    if (!purchase.entryCode) {
      purchase.entryCode = generateEntryCode('MOM', purchase.date);
    }

    purchase.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: purchase.date,
        momoType: purchase.momoType,
        quantity: purchase.quantity,
        rate: purchase.rate,
        totalAmount: purchase.totalAmount,
        supplierName: purchase.supplierName,
        paymentMode: purchase.paymentMode,
        remarks: purchase.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: reason || 'Operational correction',
    });

    await purchase.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: purchase._id,
      module: 'MOMO_PURCHASE',
      entryCode: purchase.entryCode,
      action: 'EDIT',
      originalData: previousSnapshot,
      updatedData: {
        date: purchase.date,
        momoType: purchase.momoType,
        quantity: purchase.quantity,
        rate: purchase.rate,
        totalAmount: purchase.totalAmount,
        supplierName: purchase.supplierName,
        paymentMode: purchase.paymentMode,
        remarks: purchase.remarks,
      },
      reason: reason || 'Operational correction',
    });

    const updatedPurchase = await MomoPurchase.findById(purchase._id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Momo purchase updated successfully',
      data: updatedPurchase,
    });
  } catch (error) {
    console.error('Update momo purchase error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating momo purchase',
    });
  }
};

// @desc    Delete Momo Purchase
// @route   DELETE /api/momo-purchases/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.deleteMomoPurchase = async (req, res) => {
  try {
    const purchase = await MomoPurchase.findById(req.params.id);
    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: 'Momo purchase record not found',
      });
    }

    // Check Date Access (45-day rule & Date Lock)
    const dateCheck = await validateDateAccess({ dateValue: purchase.date, user: req.user, allowFuture: false });
    if (!dateCheck.isValid) {
      return res.status(dateCheck.status).json({ success: false, message: dateCheck.message });
    }

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: purchase._id,
      module: 'MOMO_PURCHASE',
      entryCode: purchase.entryCode,
      action: 'DELETE',
      originalData: {
        date: purchase.date,
        momoType: purchase.momoType,
        quantity: purchase.quantity,
        rate: purchase.rate,
        totalAmount: purchase.totalAmount,
        supplierName: purchase.supplierName,
      },
      reason: req.body?.reason || 'Record deleted',
    });

    await MomoPurchase.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Momo purchase record deleted successfully',
    });
  } catch (error) {
    console.error('Delete momo purchase error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting momo purchase',
    });
  }
};
