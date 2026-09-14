const Sales = require('../models/Sales');
const Expense = require('../models/Expense');
const MomoPurchase = require('../models/MomoPurchase');
const CashEntry = require('../models/CashEntry');
const ChefRequirement = require('../models/ChefRequirement');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Get Unified Operational History across modules
// @route   GET /api/history
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2, CHEF)
exports.getHistory = async (req, res) => {
  try {
    const { module: targetModule, datePreset, fromDate, toDate, search } = req.query;
    const role = req.user.role;

    const dateFilter = buildDateFilter(datePreset, fromDate, toDate);
    const baseQuery = {};
    if (dateFilter) baseQuery.date = dateFilter;
    apply45DayQueryLimit(req, baseQuery, 'date');

    let historyItems = [];

    // 1. Sales (SUPER_ADMIN, MAIN_MANAGER only)
    if (
      (!targetModule || targetModule === 'all' || targetModule === 'sales') &&
      role !== 'MANAGER_2' &&
      role !== 'CHEF'
    ) {
      const salesQuery = { ...baseQuery };
      if (search && search.trim()) {
        salesQuery.remarks = { $regex: search.trim(), $options: 'i' };
      }
      const sales = await Sales.find(salesQuery)
        .populate('enteredBy', 'name email mobile role')
        .sort({ date: -1, createdAt: -1 })
        .limit(50);

      sales.forEach((s) => {
        historyItems.push({
          _id: s._id,
          module: 'Sales',
          date: s.date,
          title: `Sales Collection - ₹${s.amount.toLocaleString('en-IN')}`,
          subtitle: `Payment via ${s.paymentMode}`,
          amount: s.amount,
          type: 'income',
          status: 'Recorded',
          remarks: s.remarks,
          enteredBy: s.enteredBy,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          raw: s,
        });
      });
    }

    // 2. Expenses (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
    if ((!targetModule || targetModule === 'all' || targetModule === 'expenses') && role !== 'CHEF') {
      const expenseQuery = { ...baseQuery };
      if (search && search.trim()) {
        expenseQuery.$or = [
          { item: { $regex: search.trim(), $options: 'i' } },
          { remarks: { $regex: search.trim(), $options: 'i' } },
        ];
      }
      const expenses = await Expense.find(expenseQuery)
        .populate('enteredBy', 'name email mobile role')
        .sort({ date: -1, createdAt: -1 })
        .limit(50);

      expenses.forEach((e) => {
        historyItems.push({
          _id: e._id,
          module: 'Expenses',
          date: e.date,
          title: `${e.item} (${e.category})`,
          subtitle: `Amount: ₹${e.amount.toLocaleString('en-IN')} via ${e.paymentMode}`,
          amount: e.amount,
          type: 'expense',
          status: 'Recorded',
          bill: e.bill,
          remarks: e.remarks,
          enteredBy: e.enteredBy,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          raw: e,
        });
      });
    }

    // 3. Momo Purchases (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
    if ((!targetModule || targetModule === 'all' || targetModule === 'purchases') && role !== 'CHEF') {
      const purchaseQuery = { ...baseQuery };
      if (search && search.trim()) {
        purchaseQuery.$or = [
          { supplierName: { $regex: search.trim(), $options: 'i' } },
          { remarks: { $regex: search.trim(), $options: 'i' } },
        ];
      }
      const purchases = await MomoPurchase.find(purchaseQuery)
        .populate('enteredBy', 'name email mobile role')
        .sort({ date: -1, createdAt: -1 })
        .limit(50);

      purchases.forEach((p) => {
        historyItems.push({
          _id: p._id,
          module: 'Momo Purchases',
          date: p.date,
          title: `${p.momoType} - ${p.quantity} units @ ₹${p.rate}`,
          subtitle: `Total: ₹${p.totalAmount.toLocaleString('en-IN')} (${p.supplierName || 'Standard Batch'})`,
          amount: p.totalAmount,
          type: 'purchase',
          status: 'Received',
          remarks: p.remarks,
          enteredBy: p.enteredBy,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          raw: p,
        });
      });
    }

    // 4. Cash Entries (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
    if ((!targetModule || targetModule === 'all' || targetModule === 'cash') && role !== 'CHEF') {
      const cashQuery = { ...baseQuery };
      if (search && search.trim()) {
        cashQuery.remarks = { $regex: search.trim(), $options: 'i' };
      }
      const cashEntries = await CashEntry.find(cashQuery)
        .populate('enteredBy', 'name email mobile role')
        .sort({ date: -1, createdAt: -1 })
        .limit(50);

      cashEntries.forEach((c) => {
        historyItems.push({
          _id: c._id,
          module: 'Cash Management',
          date: c.date,
          title: `Daily Cash Drawer - ₹${c.closingCash.toLocaleString('en-IN')}`,
          subtitle: `Opening ₹${c.openingCash} | Rec +₹${c.cashReceived} | Paid -₹${c.cashPaid}`,
          amount: c.closingCash,
          type: 'cash',
          status: 'Tally Saved',
          remarks: c.remarks,
          enteredBy: c.enteredBy,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          raw: c,
        });
      });
    }

    // 5. Chef Requirements (All roles with role-based restriction)
    if (!targetModule || targetModule === 'all' || targetModule === 'chef') {
      const chefQuery = { ...baseQuery };
      if (role === 'CHEF') {
        chefQuery.enteredBy = req.user._id;
      }
      if (search && search.trim()) {
        chefQuery.$or = [
          { itemName: { $regex: search.trim(), $options: 'i' } },
          { remarks: { $regex: search.trim(), $options: 'i' } },
        ];
      }
      const chefReqs = await ChefRequirement.find(chefQuery)
        .populate('enteredBy', 'name email mobile role')
        .sort({ date: -1, createdAt: -1 })
        .limit(50);

      chefReqs.forEach((cr) => {
        historyItems.push({
          _id: cr._id,
          module: 'Chef Requirements',
          date: cr.date,
          title: `${cr.itemName} - ${cr.quantity} ${cr.unit}`,
          subtitle: `Priority: ${cr.priority} | Status: ${cr.status}`,
          amount: null,
          type: 'chef',
          status: cr.status,
          priority: cr.priority,
          remarks: cr.remarks,
          enteredBy: cr.enteredBy,
          createdAt: cr.createdAt,
          updatedAt: cr.updatedAt,
          raw: cr,
        });
      });
    }

    // Sort all merged entries newest first
    historyItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Slice for basic pagination
    const { page, limit, skip } = getPagination(req.query);
    const paginatedItems = historyItems.slice(skip, skip + limit);

    return res.status(200).json({
      success: true,
      total: historyItems.length,
      page,
      limit,
      totalPages: Math.ceil(historyItems.length / limit) || 1,
      count: paginatedItems.length,
      data: paginatedItems,
    });
  } catch (error) {
    console.error('Get history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching operational history',
    });
  }
};
