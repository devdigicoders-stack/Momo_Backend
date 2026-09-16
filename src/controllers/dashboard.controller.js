const Sales = require('../models/Sales');
const Expense = require('../models/Expense');
const MomoPurchase = require('../models/MomoPurchase');
const CashEntry = require('../models/CashEntry');
const AdditionalCash = require('../models/AdditionalCash');
const CashDeposit = require('../models/CashDeposit');
const ChefRequirement = require('../models/ChefRequirement');
const Employee = require('../models/Employee');
const { buildDateFilter } = require('../utils/queryHelpers');
const { apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Get Comprehensive Phase 7 Dashboard Summary with MongoDB Aggregations
// @route   GET /api/dashboard/summary
// @access  Private (All authenticated roles with role-based visibility)
exports.getDashboardSummary = async (req, res) => {
  try {
    const role = req.user.role;
    const { date, datePreset = 'today', fromDate, toDate } = req.query;

    // Build date filter
    let dateFilter;
    if (date) {
      const selectedDate = new Date(date);
      if (!isNaN(selectedDate.getTime())) {
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);
        dateFilter = { $gte: start, $lte: end };
      }
    } else {
      dateFilter = buildDateFilter(datePreset, fromDate, toDate);
    }

    const query = {};
    if (dateFilter) query.date = dateFilter;
    apply45DayQueryLimit(req, query, 'date');

    // 1. CHEF SPECIFIC VIEW
    if (role === 'CHEF') {
      const chefQuery = { ...query };
      const myChefQuery = { ...query, enteredBy: req.user._id };

      const [totalReqs, myReqs, pendingReqs, approvedReqs, completedReqs, rejectedReqs] =
        await Promise.all([
          ChefRequirement.countDocuments(chefQuery),
          ChefRequirement.countDocuments(myChefQuery),
          ChefRequirement.countDocuments({ ...myChefQuery, status: 'PENDING' }),
          ChefRequirement.countDocuments({ ...myChefQuery, status: 'APPROVED' }),
          ChefRequirement.countDocuments({
            ...myChefQuery,
            status: { $in: ['PURCHASED', 'COMPLETED'] },
          }),
          ChefRequirement.countDocuments({ ...myChefQuery, status: 'REJECTED' }),
        ]);

      return res.status(200).json({
        success: true,
        data: {
          role: 'CHEF',
          datePreset: date ? 'custom' : datePreset,
          date: date || null,
          chefRequirements: {
            total: totalReqs,
            myRequests: myReqs,
            pending: pendingReqs,
            approved: approvedReqs,
            completed: completedReqs,
            rejected: rejectedReqs,
          },
        },
      });
    }

    // 2. PARALLEL AGGREGATIONS FOR MANAGERS & SUPER ADMIN
    const isManager2 = role === 'MANAGER_2';

    // Sales Aggregation (Super Admin & Main Manager only)
    const salesPromise = !isManager2
      ? Sales.aggregate([
          { $match: query },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]);

    const salesPaymentModesPromise = !isManager2
      ? Sales.aggregate([
          { $match: query },
          {
            $group: {
              _id: '$paymentMode',
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]);

    // Expense Aggregation
    const expensePromise = Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const expenseCategoryPromise = Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Momo Purchase Aggregation
    const momoPurchasePromise = MomoPurchase.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Cash Calculations
    const cashSalesPromise = Sales.aggregate([
      { $match: { ...query, paymentMode: 'Cash' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const additionalCashPromise = AdditionalCash.aggregate([
      { $match: { ...query, status: 'ACTIVE' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const cashExpensesPromise = Expense.aggregate([
      { $match: { ...query, paymentMode: 'Cash' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const cashDepositsPromise = CashDeposit.aggregate([
      { $match: { ...query, status: 'ACTIVE' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    // All-time Available Cash calculation
    const allTimeAvailablePromise = Promise.all([
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

    // Chef Requirement Counts
    const chefReqsPromise = Promise.all([
      ChefRequirement.countDocuments(query),
      ChefRequirement.countDocuments({ ...query, status: 'PENDING' }),
      ChefRequirement.countDocuments({ ...query, status: 'APPROVED' }),
      ChefRequirement.countDocuments({
        ...query,
        status: { $in: ['PURCHASED', 'COMPLETED'] },
      }),
      ChefRequirement.countDocuments({ ...query, status: 'REJECTED' }),
    ]);

    // Employee Counts
    const employeeCountsPromise = Promise.all([
      Employee.countDocuments(),
      Employee.countDocuments({ status: 'Active' }),
      Employee.countDocuments({ status: 'Inactive' }),
    ]);

    // Await all aggregations
    const [
      salesAgg,
      salesModesAgg,
      expenseAgg,
      expenseCatAgg,
      momoPurchAgg,
      cashSalesAgg,
      additionalCashAgg,
      cashExpensesAgg,
      cashDepositsAgg,
      [allSales, allAdd, allExp, allDep],
      [chefTotal, chefPending, chefApproved, chefCompleted, chefRejected],
      [empTotal, empActive, empInactive],
    ] = await Promise.all([
      salesPromise,
      salesPaymentModesPromise,
      expensePromise,
      expenseCategoryPromise,
      momoPurchasePromise,
      cashSalesPromise,
      additionalCashPromise,
      cashExpensesPromise,
      cashDepositsPromise,
      allTimeAvailablePromise,
      chefReqsPromise,
      employeeCountsPromise,
    ]);

    // Extract Sales
    const totalSales = salesAgg.length > 0 ? salesAgg[0].totalAmount : 0;
    const salesCount = salesAgg.length > 0 ? salesAgg[0].count : 0;

    const paymentModes = { Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0 };
    salesModesAgg.forEach((item) => {
      if (item._id && paymentModes[item._id] !== undefined) {
        paymentModes[item._id] = item.totalAmount;
      }
    });

    // Extract Expenses
    const totalExpenses = expenseAgg.length > 0 ? expenseAgg[0].totalAmount : 0;
    const expenseCount = expenseAgg.length > 0 ? expenseAgg[0].count : 0;
    const expenseCategories = expenseCatAgg.map((c) => ({
      category: c._id || 'Uncategorized',
      totalAmount: c.totalAmount,
      count: c.count,
    }));

    // Extract Momo Purchases
    const totalMomoPurchase = momoPurchAgg.length > 0 ? momoPurchAgg[0].totalAmount : 0;
    const totalMomoQty = momoPurchAgg.length > 0 ? momoPurchAgg[0].totalQuantity : 0;
    const momoPurchasesCount = momoPurchAgg.length > 0 ? momoPurchAgg[0].count : 0;

    // Extract Dynamic Cash Management Metrics
    const periodCashCollection = cashSalesAgg[0]?.total || 0;
    const periodAdditionalCash = additionalCashAgg[0]?.total || 0;
    const periodCashExpenses = cashExpensesAgg[0]?.total || 0;
    const periodCashDeposits = cashDepositsAgg[0]?.total || 0;

    const allInflow = (allSales[0]?.total || 0) + (allAdd[0]?.total || 0);
    const allOutflow = (allExp[0]?.total || 0) + (allDep[0]?.total || 0);
    const liveAvailableCash = Math.max(0, allInflow - allOutflow);

    const totalCashLogs =
      (cashSalesAgg[0]?.count || 0) +
      (additionalCashAgg[0]?.count || 0) +
      (cashExpensesAgg[0]?.count || 0) +
      (cashDepositsAgg[0]?.count || 0);

    const cashSummary = {
      cashCollection: periodCashCollection,
      additionalCash: periodAdditionalCash,
      cashExpenses: periodCashExpenses,
      cashDeposit: periodCashDeposits,
      netCashChange: periodCashCollection + periodAdditionalCash - periodCashExpenses - periodCashDeposits,
      availableCash: liveAvailableCash,
      // Backward compatibility aliases for dashboard widgets
      opening: periodCashCollection,
      received: periodAdditionalCash,
      paid: periodCashExpenses,
      closing: liveAvailableCash,
      count: totalCashLogs,
    };

    // Basic Operating Difference = Sales - Expenses - Momo Purchase
    const basicOperatingDifference = totalSales - (totalExpenses + totalMomoPurchase);

    return res.status(200).json({
      success: true,
      data: {
        role,
        datePreset: date ? 'custom' : datePreset,
        date: date || null,
        sales: !isManager2 ? totalSales : null,
        salesCount: !isManager2 ? salesCount : null,
        salesPaymentModes: !isManager2 ? paymentModes : null,
        expenses: totalExpenses,
        expenseCount,
        expenseCategories,
        momoPurchase: totalMomoPurchase,
        momoPurchaseQty: totalMomoQty,
        momoPurchasesCount,
        cash: cashSummary,
        chefRequirements: {
          total: chefTotal,
          pending: chefPending,
          approved: chefApproved,
          completed: chefCompleted,
          rejected: chefRejected,
        },
        employees: {
          total: empTotal,
          active: empActive,
          inactive: empInactive,
        },
        basicOperatingDifference: !isManager2 ? basicOperatingDifference : null,
      },
    });
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while calculating dashboard summary',
    });
  }
};

// @desc    Get daily counts for backward compatibility
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const role = req.user.role;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayFilter = {
      date: { $gte: startOfToday, $lte: endOfToday },
    };

    const [
      todaySalesCount,
      todayExpensesCount,
      todayPurchasesCount,
      todayAddCashCount,
      todayDepositCount,
      todayChefReqsCount,
      activeEmployeesCount,
      myChefReqsCount,
    ] = await Promise.all([
      Sales.countDocuments(todayFilter),
      Expense.countDocuments(todayFilter),
      MomoPurchase.countDocuments(todayFilter),
      AdditionalCash.countDocuments({ ...todayFilter, status: 'ACTIVE' }),
      CashDeposit.countDocuments({ ...todayFilter, status: 'ACTIVE' }),
      ChefRequirement.countDocuments(todayFilter),
      Employee.countDocuments({ status: 'Active' }),
      ChefRequirement.countDocuments({ enteredBy: req.user._id, ...todayFilter }),
    ]);

    const stats = {
      todaySalesCount: role !== 'MANAGER_2' && role !== 'CHEF' ? todaySalesCount : 0,
      todayExpensesCount: role !== 'CHEF' ? todayExpensesCount : 0,
      todayPurchasesCount: role !== 'CHEF' ? todayPurchasesCount : 0,
      todayCashCount: role !== 'CHEF' ? todayAddCashCount + todayDepositCount : 0,
      todayChefReqsCount: role === 'CHEF' ? myChefReqsCount : todayChefReqsCount,
      activeEmployeesCount: role !== 'CHEF' ? activeEmployeesCount : 0,
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics',
    });
  }
};
