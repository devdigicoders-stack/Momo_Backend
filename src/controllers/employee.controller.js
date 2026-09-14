const Employee = require('../models/Employee');
const EmployeeAttendance = require('../models/EmployeeAttendance');
const SalaryAdvance = require('../models/SalaryAdvance');
const SalaryPayment = require('../models/SalaryPayment');
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
// 1. EMPLOYEE MASTER CRUD
// =========================================================================

// @desc    Create new Employee
// @route   POST /api/employees
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createEmployee = async (req, res) => {
  try {
    const { name, mobile, designation, joiningDate, salary, status, remarks } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Employee name is required' });
    }

    if (!mobile || !/^[0-9]{10}$/.test(mobile.trim())) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
    }

    if (!designation) {
      return res.status(400).json({ success: false, message: 'Employee designation is required' });
    }

    const sal = Number(salary);
    if (isNaN(sal) || sal < 0) {
      return res.status(400).json({ success: false, message: 'Valid non-negative salary is required' });
    }

    // Check duplicate mobile
    const existing = await Employee.findOne({ mobile: mobile.trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An employee with this mobile number already exists' });
    }

    const employee = await Employee.create({
      name: name.trim(),
      mobile: mobile.trim(),
      designation,
      joiningDate: joiningDate || Date.now(),
      salary: sal,
      status: status || 'Active',
      remarks: remarks || '',
      enteredBy: req.user._id,
    });

    const populated = await Employee.findById(employee._id).populate('enteredBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Employee record created successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Create employee error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error while creating employee' });
  }
};

// @desc    Get all Employees (Filters, Search, Pagination)
// @route   GET /api/employees
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAllEmployees = async (req, res) => {
  try {
    const { status, designation, search, page = 1, limit = 20, all = false } = req.query;
    let queryFilter = {};

    if (status && status !== 'ALL') {
      queryFilter.status = status;
    }

    if (designation && designation !== 'ALL') {
      queryFilter.designation = designation;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      queryFilter.$or = [{ name: searchRegex }, { mobile: searchRegex }, { remarks: searchRegex }];
    }

    if (all === 'true' || all === true) {
      const allEmployees = await Employee.find(queryFilter)
        .populate('enteredBy', 'name email role')
        .sort({ status: 1, name: 1 });
      return res.status(200).json({ success: true, data: allEmployees });
    }

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [employees, total] = await Promise.all([
      Employee.find(queryFilter)
        .populate('enteredBy', 'name email role')
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      Employee.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: employees,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get all employees error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching employees' });
  }
};

// @desc    Get single Employee by ID
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate('enteredBy', 'name email role');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee record not found' });
    }
    return res.status(200).json({ success: true, data: employee });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Employee
// @route   PUT /api/employees/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, designation, joiningDate, salary, status, remarks, reason } = req.body;

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee record not found' });
    }

    // Capture snapshot before mutation
    const previousSnapshot = {
      name: employee.name,
      mobile: employee.mobile,
      designation: employee.designation,
      joiningDate: employee.joiningDate,
      salary: employee.salary,
      status: employee.status,
      remarks: employee.remarks,
    };

    if (name) employee.name = name.trim();
    if (mobile) {
      if (!/^[0-9]{10}$/.test(mobile.trim())) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
      }
      employee.mobile = mobile.trim();
    }
    if (designation) employee.designation = designation;
    if (joiningDate) employee.joiningDate = joiningDate;
    if (salary !== undefined) {
      const sal = Number(salary);
      if (isNaN(sal) || sal < 0) {
        return res.status(400).json({ success: false, message: 'Valid non-negative salary is required' });
      }
      employee.salary = sal;
    }
    if (status) employee.status = status;
    if (remarks !== undefined) employee.remarks = remarks.trim();

    await employee.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: employee._id,
      module: 'EMPLOYEE',
      entryCode: employee.employeeCode || String(employee._id),
      action: 'EDIT',
      originalData: previousSnapshot,
      updatedData: {
        name: employee.name,
        mobile: employee.mobile,
        designation: employee.designation,
        joiningDate: employee.joiningDate,
        salary: employee.salary,
        status: employee.status,
        remarks: employee.remarks,
      },
      reason: reason || 'Employee record updated',
    });

    const updated = await Employee.findById(id).populate('enteredBy', 'name email role');

    return res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update employee error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
};

// @desc    Toggle Employee status (Active <-> Inactive)
// @route   PATCH /api/employees/:id/toggle-status
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee record not found' });
    }

    const previousStatus = employee.status;
    employee.status = employee.status === 'Active' ? 'Inactive' : 'Active';
    await employee.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: employee._id,
      module: 'EMPLOYEE',
      entryCode: employee.employeeCode || String(employee._id),
      action: 'STATUS_CHANGE',
      originalData: { status: previousStatus },
      updatedData: { status: employee.status },
      reason: `Status toggled from ${previousStatus} to ${employee.status}`,
    });

    return res.status(200).json({
      success: true,
      message: `Employee marked as ${employee.status}`,
      data: employee,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to toggle employee status' });
  }
};

// =========================================================================
// 2. ATTENDANCE & ABSENT MANAGEMENT
// =========================================================================

// @desc    Mark Employee Absent
// @route   POST /api/employees/attendance/absent
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.markAbsent = async (req, res) => {
  try {
    const { employeeId, date, remarks } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Date Access Check (Future Date, 45-day rule, Date Lock)
    const dateValidation = await validateDateAccess({ dateValue: targetDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    // Check Duplicate Absent Record on Same Date
    const existing = await EmployeeAttendance.findOne({
      employee: employeeId,
      date: targetDate,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `${employee.name} is already marked as ${existing.status} for this date.`,
      });
    }

    const entryCode = generateEntryCode('ATT', targetDate);

    const attendance = await EmployeeAttendance.create({
      employee: employeeId,
      date: targetDate,
      status: 'Absent',
      remarks: remarks ? remarks.trim() : 'Marked absent',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await EmployeeAttendance.findById(attendance._id)
      .populate('employee', 'name mobile designation salary')
      .populate('enteredBy', 'name role');

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: attendance._id,
      module: 'ATTENDANCE',
      entryCode: entryCode,
      action: 'CREATE',
      originalData: {},
      updatedData: {
        employee: employee.name,
        date: targetDate,
        status: 'Absent',
        remarks: attendance.remarks,
      },
      reason: `Absent marked for ${employee.name}`,
    });

    return res.status(201).json({
      success: true,
      message: `${employee.name} marked absent for ${targetDate.toLocaleDateString('en-IN')}`,
      data: populated,
    });
  } catch (error) {
    console.error('Mark absent error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Remove / Unmark Absent Record
// @route   DELETE /api/employees/attendance/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.removeAbsent = async (req, res) => {
  try {
    const record = await EmployeeAttendance.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }

    const dateCheck = await validateDateAccess({ dateValue: record.date, user: req.user, allowFuture: false });
    if (!dateCheck.isValid) {
      return res.status(dateCheck.status).json({ success: false, message: dateCheck.message });
    }

    await EmployeeAttendance.findByIdAndDelete(req.params.id);

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: req.params.id,
      module: 'ATTENDANCE',
      entryCode: record.entryCode || String(req.params.id),
      action: 'DELETE',
      originalData: {
        employee: record.employee,
        date: record.date,
        status: record.status,
        remarks: record.remarks,
      },
      reason: req.body?.reason || 'Absent mark removed',
    });

    return res.status(200).json({
      success: true,
      message: 'Absent mark removed successfully',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to remove attendance mark' });
  }
};

// @desc    Get Attendance & Absent Records
// @route   GET /api/employees/attendance
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getAttendanceRecords = async (req, res) => {
  try {
    const { employeeId, date, month, startDate, endDate, page = 1, limit = 20 } = req.query;
    let queryFilter = {};

    if (employeeId) {
      queryFilter.employee = employeeId;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { startOfMonth, endOfMonth } = getMonthBounds(month);
      queryFilter.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else {
      const dateFilter = buildDateFilter(date, startDate, endDate);
      if (Object.keys(dateFilter).length > 0) {
        queryFilter = { ...queryFilter, ...dateFilter };
      }
    }

    enforce45DayLimit(req, queryFilter);

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [records, total] = await Promise.all([
      EmployeeAttendance.find(queryFilter)
        .populate('employee', 'name mobile designation salary status')
        .populate('enteredBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      EmployeeAttendance.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: records,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get attendance records error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance records' });
  }
};

// @desc    Get Monthly Absent Count for an Employee
// @route   GET /api/employees/:id/absent-count
// @access  Private
exports.getEmployeeAbsentCount = async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query;
    const { startOfMonth, endOfMonth, formattedMonth } = getMonthBounds(month);

    const count = await EmployeeAttendance.countDocuments({
      employee: id,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      status: 'Absent',
    });

    return res.status(200).json({
      success: true,
      data: {
        employeeId: id,
        month: formattedMonth,
        absentDays: count,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to calculate absent count' });
  }
};

// =========================================================================
// 3. SALARY ADVANCE MANAGEMENT
// =========================================================================

// @desc    Create Salary Advance
// @route   POST /api/employees/advance
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createSalaryAdvance = async (req, res) => {
  try {
    const { employeeId, amount, date, remarks } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee is required' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive advance amount is required' });
    }

    const targetDate = date ? new Date(date) : new Date();

    // Date Access Check (Future Date, 45-day rule, Date Lock)
    const dateValidation = await validateDateAccess({ dateValue: targetDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    // 5-second duplicate submission guard
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await SalaryAdvance.findOne({
      employee: employeeId,
      amount: numAmount,
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate advance entry detected. This advance was recorded a moment ago.',
      });
    }

    const entryCode = generateEntryCode('ADV', targetDate);

    const advance = await SalaryAdvance.create({
      employee: employeeId,
      amount: numAmount,
      date: targetDate,
      remarks: remarks ? remarks.trim() : 'Salary advance',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await SalaryAdvance.findById(advance._id)
      .populate('employee', 'name mobile designation salary')
      .populate('enteredBy', 'name role');

    return res.status(201).json({
      success: true,
      message: `Salary advance of ₹${numAmount.toLocaleString('en-IN')} recorded for ${employee.name}`,
      data: populated,
    });
  } catch (error) {
    console.error('Create salary advance error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

// @desc    Get Salary Advances (Filters, Pagination)
// @route   GET /api/employees/advance
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getSalaryAdvances = async (req, res) => {
  try {
    const { employeeId, date, month, startDate, endDate, search, page = 1, limit = 20 } = req.query;
    let queryFilter = { status: 'ACTIVE' };

    if (employeeId) {
      queryFilter.employee = employeeId;
    }

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const { startOfMonth, endOfMonth } = getMonthBounds(month);
      queryFilter.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else {
      const dateFilter = buildDateFilter(date, startDate, endDate);
      if (Object.keys(dateFilter).length > 0) {
        queryFilter = { ...queryFilter, ...dateFilter };
      }
    }

    enforce45DayLimit(req, queryFilter);

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      queryFilter.$or = [{ remarks: searchRegex }, { entryCode: searchRegex }];
    }

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [advances, total] = await Promise.all([
      SalaryAdvance.find(queryFilter)
        .populate('employee', 'name mobile designation salary')
        .populate('enteredBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .populate('editHistory.editedBy', 'name role')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      SalaryAdvance.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: advances,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get salary advances error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve advances' });
  }
};

// @desc    Get Single Salary Advance by ID
// @route   GET /api/employees/advance/:id
// @access  Private
exports.getSalaryAdvanceById = async (req, res) => {
  try {
    const advance = await SalaryAdvance.findById(req.params.id)
      .populate('employee', 'name mobile designation salary')
      .populate('enteredBy', 'name role');
    if (!advance) return res.status(404).json({ success: false, message: 'Advance record not found' });
    return res.status(200).json({ success: true, data: advance });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update Salary Advance
// @route   PUT /api/employees/advance/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateSalaryAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, remarks, editReason } = req.body;

    const advance = await SalaryAdvance.findById(id);
    if (!advance) return res.status(404).json({ success: false, message: 'Advance record not found' });

    const check1 = await validateDateAccess({ dateValue: advance.date, user: req.user, allowFuture: false });
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
      amount: advance.amount,
      date: advance.date,
      remarks: advance.remarks,
    };

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
      }
      advance.amount = numAmount;
    }

    if (date) advance.date = new Date(date);
    if (remarks !== undefined) advance.remarks = remarks.trim();

    advance.isEdited = true;
    advance.lastUpdatedBy = req.user._id;
    advance.editHistory.push({
      previousData,
      updatedData: {
        amount: advance.amount,
        date: advance.date,
        remarks: advance.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: editReason || 'Correction of salary advance record',
    });

    await advance.save();

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: advance._id,
      module: 'SALARY_ADVANCE',
      entryCode: advance.entryCode || '',
      action: 'EDIT',
      originalData: previousData,
      updatedData: {
        amount: advance.amount,
        date: advance.date,
        remarks: advance.remarks,
      },
      reason: editReason || 'Correction of salary advance record',
    });

    const updated = await SalaryAdvance.findById(id)
      .populate('employee', 'name mobile designation salary')
      .populate('enteredBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Advance record updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update advance error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update advance record' });
  }
};

// =========================================================================
// 4. MONTHLY SALARY CALCULATION & PAYMENT
// =========================================================================

// @desc    Get Monthly Salary Sheet & Calculation for all employees
// @route   GET /api/employees/salary/summary
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getMonthlySalarySummary = async (req, res) => {
  try {
    const { month } = req.query;
    const { startOfMonth, endOfMonth, daysInMonth, formattedMonth } = getMonthBounds(month);

    // 1. Fetch active employees (or any with records this month)
    const employees = await Employee.find({ status: 'Active' }).sort({ name: 1 });

    // 2. Aggregate Absents for this month
    const absentAgg = await EmployeeAttendance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: 'Absent',
        },
      },
      {
        $group: {
          _id: '$employee',
          absentCount: { $sum: 1 },
        },
      },
    ]);

    const absentMap = {};
    absentAgg.forEach((a) => {
      absentMap[a._id.toString()] = a.absentCount;
    });

    // 3. Aggregate Advances for this month
    const advanceAgg = await SalaryAdvance.aggregate([
      {
        $match: {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: 'ACTIVE',
        },
      },
      {
        $group: {
          _id: '$employee',
          totalAdvance: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const advanceMap = {};
    advanceAgg.forEach((adv) => {
      advanceMap[adv._id.toString()] = {
        total: adv.totalAdvance,
        count: adv.count,
      };
    });

    // 4. Fetch Existing Salary Payments for this month
    const payments = await SalaryPayment.find({ salaryMonth: formattedMonth })
      .populate('paidBy', 'name role')
      .lean();

    const paymentMap = {};
    payments.forEach((p) => {
      paymentMap[p.employee.toString()] = p;
    });

    // 5. Build Salary Sheet
    let totalBaseSalary = 0;
    let totalAbsentDeduction = 0;
    let totalAdvancesDeducted = 0;
    let totalNetPayable = 0;
    let totalPaidAmount = 0;
    let pendingCount = 0;
    let paidCount = 0;

    const salarySheet = employees.map((emp) => {
      const empIdStr = emp._id.toString();
      const monthlySalary = emp.salary || 0;
      const absentDays = absentMap[empIdStr] || 0;

      // Default absent deduction: (salary / daysInMonth) * absentDays
      const perDaySalary = monthlySalary / daysInMonth;
      const calculatedAbsentDeduction = Math.round(perDaySalary * absentDays);

      const totalAdvance = advanceMap[empIdStr]?.total || 0;

      const existingPayment = paymentMap[empIdStr];
      const isPaid = !!existingPayment;

      const absentDeduction = isPaid ? existingPayment.absentDeduction : calculatedAbsentDeduction;
      const advanceDeduction = isPaid ? existingPayment.advanceDeduction : totalAdvance;

      const finalPayable = isPaid
        ? existingPayment.paidAmount
        : Math.max(0, monthlySalary - absentDeduction - advanceDeduction);

      totalBaseSalary += monthlySalary;
      totalAbsentDeduction += absentDeduction;
      totalAdvancesDeducted += advanceDeduction;
      totalNetPayable += finalPayable;

      if (isPaid) {
        paidCount++;
        totalPaidAmount += existingPayment.paidAmount;
      } else {
        pendingCount++;
      }

      return {
        employee: {
          _id: emp._id,
          name: emp.name,
          mobile: emp.mobile,
          designation: emp.designation,
          status: emp.status,
        },
        salaryMonth: formattedMonth,
        daysInMonth,
        monthlySalary,
        absentDays,
        absentDeduction,
        advanceDeduction,
        finalPayable,
        status: isPaid ? 'PAID' : 'PENDING',
        paymentDetails: isPaid ? existingPayment : null,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        salaryMonth: formattedMonth,
        daysInMonth,
        summary: {
          totalEmployees: employees.length,
          totalBaseSalary,
          totalAbsentDeduction,
          totalAdvancesDeducted,
          totalNetPayable,
          totalPaidAmount,
          pendingCount,
          paidCount,
        },
        salarySheet,
      },
    });
  } catch (error) {
    console.error('Get monthly salary summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute monthly salary summary' });
  }
};

// @desc    Get Salary Calculation for a single Employee
// @route   GET /api/employees/:id/salary-calculation
// @access  Private
exports.getEmployeeSalaryCalculation = async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query;
    const { startOfMonth, endOfMonth, daysInMonth, formattedMonth } = getMonthBounds(month);

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const [absentDays, advanceAgg, existingPayment] = await Promise.all([
      EmployeeAttendance.countDocuments({
        employee: id,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'Absent',
      }),
      SalaryAdvance.aggregate([
        {
          $match: {
            employee: employee._id,
            date: { $gte: startOfMonth, $lte: endOfMonth },
            status: 'ACTIVE',
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]),
      SalaryPayment.findOne({ employee: id, salaryMonth: formattedMonth }).populate('paidBy', 'name role'),
    ]);

    const totalAdvance = advanceAgg[0]?.total || 0;
    const monthlySalary = employee.salary || 0;
    const perDaySalary = monthlySalary / daysInMonth;
    const calculatedAbsentDeduction = Math.round(perDaySalary * absentDays);

    const isPaid = !!existingPayment;
    const absentDeduction = isPaid ? existingPayment.absentDeduction : calculatedAbsentDeduction;
    const advanceDeduction = isPaid ? existingPayment.advanceDeduction : totalAdvance;
    const finalPayable = isPaid
      ? existingPayment.paidAmount
      : Math.max(0, monthlySalary - absentDeduction - advanceDeduction);

    return res.status(200).json({
      success: true,
      data: {
        employee: {
          _id: employee._id,
          name: employee.name,
          mobile: employee.mobile,
          designation: employee.designation,
          salary: employee.salary,
        },
        salaryMonth: formattedMonth,
        daysInMonth,
        monthlySalary,
        absentDays,
        perDaySalary: Math.round(perDaySalary),
        absentDeduction,
        advanceDeduction,
        finalPayable,
        status: isPaid ? 'PAID' : 'PENDING',
        paymentDetails: existingPayment,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to calculate employee salary' });
  }
};

// @desc    Record Salary Payment
// @route   POST /api/employees/salary/pay
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.paySalary = async (req, res) => {
  try {
    const {
      employeeId,
      salaryMonth,
      monthlySalary,
      absentDays,
      absentDeduction,
      advanceDeduction,
      paidAmount,
      paymentDate,
      paymentMode,
      remarks,
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee is required' });
    }

    if (!salaryMonth || !/^\d{4}-\d{2}$/.test(salaryMonth)) {
      return res.status(400).json({ success: false, message: 'Valid salary month (YYYY-MM) is required' });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Check if salary for this month is already paid
    const existingPayment = await SalaryPayment.findOne({
      employee: employeeId,
      salaryMonth,
    });

    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: `Salary for ${employee.name} for ${salaryMonth} was already paid on ${new Date(
          existingPayment.paymentDate
        ).toLocaleDateString('en-IN')}`,
      });
    }

    const numPaid = Number(paidAmount);
    if (isNaN(numPaid) || numPaid < 0) {
      return res.status(400).json({ success: false, message: 'Valid non-negative paid amount is required' });
    }

    const payDate = paymentDate ? new Date(paymentDate) : new Date();

    // Date Access Check (Future Date, 45-day rule, Date Lock)
    const dateValidation = await validateDateAccess({ dateValue: payDate, user: req.user, allowFuture: false });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({ success: false, message: dateValidation.message });
    }

    const entryCode = generateEntryCode('PAY', payDate);

    const payment = await SalaryPayment.create({
      employee: employeeId,
      salaryMonth,
      monthlySalary: Number(monthlySalary) || employee.salary,
      absentDays: Number(absentDays) || 0,
      absentDeduction: Number(absentDeduction) || 0,
      advanceDeduction: Number(advanceDeduction) || 0,
      paidAmount: numPaid,
      paymentDate: payDate,
      paymentMode: paymentMode || 'Cash',
      remarks: remarks ? remarks.trim() : `Salary disbursement for ${salaryMonth}`,
      paidBy: req.user._id,
      status: 'PAID',
      entryCode,
    });

    const populated = await SalaryPayment.findById(payment._id)
      .populate('employee', 'name mobile designation salary')
      .populate('paidBy', 'name role');

    // Centralized Audit Log
    await logAudit({
      req,
      recordId: payment._id,
      module: 'SALARY',
      entryCode: entryCode,
      action: 'CREATE',
      originalData: {},
      updatedData: {
        employee: employee.name,
        salaryMonth,
        monthlySalary: payment.monthlySalary,
        absentDeduction: payment.absentDeduction,
        advanceDeduction: payment.advanceDeduction,
        paidAmount: payment.paidAmount,
        paymentMode: payment.paymentMode,
        paymentDate: payment.paymentDate,
      },
      reason: `Salary disbursement for ${salaryMonth}`,
    });

    return res.status(201).json({
      success: true,
      message: `Salary of ₹${numPaid.toLocaleString('en-IN')} paid successfully to ${employee.name}`,
      data: populated,
    });
  } catch (error) {
    console.error('Pay salary error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error while paying salary' });
  }
};

// @desc    Get Salary Payment History (Ledger)
// @route   GET /api/employees/salary/payments
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.getSalaryPayments = async (req, res) => {
  try {
    const { employeeId, salaryMonth, paymentMode, search, page = 1, limit = 20 } = req.query;
    let queryFilter = {};

    if (employeeId) {
      queryFilter.employee = employeeId;
    }

    if (salaryMonth && /^\d{4}-\d{2}$/.test(salaryMonth)) {
      queryFilter.salaryMonth = salaryMonth;
    }

    if (paymentMode && paymentMode !== 'ALL') {
      queryFilter.paymentMode = paymentMode;
    }

    enforce45DayLimit(req, queryFilter);

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      queryFilter.$or = [{ remarks: searchRegex }, { entryCode: searchRegex }];
    }

    const { skip, take, pageNumber } = getPagination(page, limit);

    const [payments, total] = await Promise.all([
      SalaryPayment.find(queryFilter)
        .populate('employee', 'name mobile designation salary')
        .populate('paidBy', 'name role')
        .populate('lastUpdatedBy', 'name role')
        .populate('editHistory.editedBy', 'name role')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(take),
      SalaryPayment.countDocuments(queryFilter),
    ]);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: pageNumber,
        limit: take,
        pages: Math.ceil(total / take) || 1,
      },
    });
  } catch (error) {
    console.error('Get salary payments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve salary payments' });
  }
};

// @desc    Get Salary History for a specific Employee
// @route   GET /api/employees/:id/salary-history
// @access  Private
exports.getEmployeeSalaryHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await SalaryPayment.find({ employee: id })
      .populate('paidBy', 'name role')
      .sort({ salaryMonth: -1, paymentDate: -1 });

    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve employee salary history' });
  }
};

// =========================================================================
// 5. EMPLOYEE FULL PROFILE & OPERATIONAL DASHBOARD SUMMARY
// =========================================================================

// @desc    Get Complete Employee Profile with all sub-histories
// @route   GET /api/employees/:id/full-profile
// @access  Private
exports.getEmployeeFullProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findById(id).populate('enteredBy', 'name role');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const [attendanceList, advanceList, salaryList] = await Promise.all([
      EmployeeAttendance.find({ employee: id }).populate('enteredBy', 'name role').sort({ date: -1 }).limit(50),
      SalaryAdvance.find({ employee: id, status: 'ACTIVE' }).populate('enteredBy', 'name role').sort({ date: -1 }).limit(50),
      SalaryPayment.find({ employee: id }).populate('paidBy', 'name role').sort({ salaryMonth: -1 }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        employee,
        recentAttendance: attendanceList,
        totalAbsentDays: attendanceList.filter((a) => a.status === 'Absent').length,
        advances: advanceList,
        totalAdvancesAmount: advanceList.reduce((sum, a) => sum + a.amount, 0),
        salaryPayments: salaryList,
        totalSalariesPaid: salaryList.reduce((sum, p) => sum + p.paidAmount, 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load employee full profile' });
  }
};

// @desc    Get Employee Operational Dashboard Summary
// @route   GET /api/employees/summary/counts
// @access  Private
exports.getEmployeeSummaryCounts = async (req, res) => {
  try {
    const { month } = req.query;
    const { startOfMonth, endOfMonth, formattedMonth } = getMonthBounds(month);

    const [activeEmployees, totalAdvancesAgg, paidSalariesCount, totalEmployees] = await Promise.all([
      Employee.countDocuments({ status: 'Active' }),
      SalaryAdvance.aggregate([
        {
          $match: {
            date: { $gte: startOfMonth, $lte: endOfMonth },
            status: 'ACTIVE',
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      SalaryPayment.countDocuments({ salaryMonth: formattedMonth }),
      Employee.countDocuments(),
    ]);

    const totalAdvances = totalAdvancesAgg[0]?.totalAmount || 0;
    const pendingSalaries = Math.max(0, activeEmployees - paidSalariesCount);

    return res.status(200).json({
      success: true,
      data: {
        month: formattedMonth,
        activeEmployees,
        totalEmployees,
        totalAdvances,
        paidSalariesCount,
        pendingSalaries,
      },
    });
  } catch (error) {
    console.error('Get employee summary counts error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
