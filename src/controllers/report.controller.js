const Sales = require('../models/Sales');
const Expense = require('../models/Expense');
const MomoPurchase = require('../models/MomoPurchase');
const CashEntry = require('../models/CashEntry');
const { buildDateFilter } = require('../utils/queryHelpers');
const { apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Get Financial & Operational Summary Report
// @route   GET /api/reports/summary
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getReportSummary = async (req, res) => {
  try {
    const { datePreset = 'today', fromDate, toDate } = req.query;
    const role = req.user.role;

    const dateFilter = buildDateFilter(datePreset, fromDate, toDate);
    const query = {};
    if (dateFilter) query.date = dateFilter;
    apply45DayQueryLimit(req, query, 'date');

    // 1. Sales Aggregation (Super Admin & Main Manager only)
    let totalSales = 0;
    let salesCount = 0;
    let salesPaymentModes = { Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0 };

    if (role !== 'MANAGER_2' && role !== 'CHEF') {
      const sales = await Sales.find(query);
      salesCount = sales.length;
      sales.forEach((s) => {
        totalSales += s.amount || 0;
        if (s.paymentMode && salesPaymentModes[s.paymentMode] !== undefined) {
          salesPaymentModes[s.paymentMode] += s.amount || 0;
        }
      });
    }

    // 2. Expense Aggregation & Category Breakdown
    let totalExpenses = 0;
    let expenseCount = 0;
    const expenseCategoryMap = {};
    const expensePaymentModes = { Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0 };

    if (role !== 'CHEF') {
      const expenses = await Expense.find(query);
      expenseCount = expenses.length;

      expenses.forEach((e) => {
        totalExpenses += e.amount || 0;
        if (e.paymentMode && expensePaymentModes[e.paymentMode] !== undefined) {
          expensePaymentModes[e.paymentMode] += e.amount || 0;
        }

        const cat = e.category || 'Uncategorized';
        if (!expenseCategoryMap[cat]) {
          expenseCategoryMap[cat] = {
            category: cat,
            totalAmount: 0,
            count: 0,
            subcategories: {},
          };
        }
        expenseCategoryMap[cat].totalAmount += e.amount || 0;
        expenseCategoryMap[cat].count += 1;

        if (e.subcategory) {
          if (!expenseCategoryMap[cat].subcategories[e.subcategory]) {
            expenseCategoryMap[cat].subcategories[e.subcategory] = 0;
          }
          expenseCategoryMap[cat].subcategories[e.subcategory] += e.amount || 0;
        }
      });
    }

    const expenseCategoryBreakdown = Object.values(expenseCategoryMap)
      .map((c) => ({
        ...c,
        percentage: totalExpenses > 0 ? ((c.totalAmount / totalExpenses) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // 3. Momo Purchases Aggregation & Type Breakdown
    let totalMomoPurchasesCost = 0;
    let totalMomoPurchasesQty = 0;
    let momoPurchasesCount = 0;
    const momoTypeMap = {};

    if (role !== 'CHEF') {
      const purchases = await MomoPurchase.find(query);
      momoPurchasesCount = purchases.length;

      purchases.forEach((p) => {
        const cost = p.totalAmount || 0;
        const qty = p.quantity || 0;
        totalMomoPurchasesCost += cost;
        totalMomoPurchasesQty += qty;

        const type = p.momoType || 'Standard Momo';
        if (!momoTypeMap[type]) {
          momoTypeMap[type] = {
            momoType: type,
            totalQuantity: 0,
            totalAmount: 0,
            count: 0,
          };
        }
        momoTypeMap[type].totalQuantity += qty;
        momoTypeMap[type].totalAmount += cost;
        momoTypeMap[type].count += 1;
      });
    }

    const momoTypeBreakdown = Object.values(momoTypeMap).map((m) => ({
      ...m,
      avgRate: m.totalQuantity > 0 ? (m.totalAmount / m.totalQuantity).toFixed(2) : 0,
    }));

    // 4. Cash Drawer Summary
    let cashSummary = {
      openingCash: 0,
      cashReceived: 0,
      cashPaid: 0,
      closingCash: 0,
      entriesCount: 0,
    };

    if (role !== 'CHEF') {
      const cashEntries = await CashEntry.find(query).sort({ date: 1, createdAt: 1 });
      cashSummary.entriesCount = cashEntries.length;

      if (cashEntries.length > 0) {
        cashSummary.openingCash = cashEntries[0].openingCash || 0;
        cashSummary.closingCash = cashEntries[cashEntries.length - 1].closingCash || 0;
        cashEntries.forEach((c) => {
          cashSummary.cashReceived += c.cashReceived || 0;
          cashSummary.cashPaid += c.cashPaid || 0;
        });
      }
    }

    // 5. Net Balance / Cash Flow Metric
    const netFlow = totalSales - (totalExpenses + totalMomoPurchasesCost);

    return res.status(200).json({
      success: true,
      data: {
        filter: {
          datePreset,
          fromDate: fromDate || null,
          toDate: toDate || null,
        },
        kpis: {
          totalSales: role !== 'MANAGER_2' ? totalSales : null,
          salesCount: role !== 'MANAGER_2' ? salesCount : null,
          totalExpenses,
          expenseCount,
          totalMomoPurchasesCost,
          totalMomoPurchasesQty,
          momoPurchasesCount,
          netFlow: role !== 'MANAGER_2' ? netFlow : null,
        },
        salesPaymentModes: role !== 'MANAGER_2' ? salesPaymentModes : null,
        expensePaymentModes,
        expenseCategoryBreakdown,
        momoTypeBreakdown,
        cashSummary,
      },
    });
  } catch (error) {
    console.error('Get report summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating summary report',
    });
  }
};
