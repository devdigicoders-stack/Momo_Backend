const express = require('express');
const router = express.Router();
const {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  toggleEmployeeStatus,
  markAbsent,
  removeAbsent,
  getAttendanceRecords,
  getEmployeeAbsentCount,
  createSalaryAdvance,
  getSalaryAdvances,
  getSalaryAdvanceById,
  updateSalaryAdvance,
  getMonthlySalarySummary,
  getEmployeeSalaryCalculation,
  paySalary,
  getSalaryPayments,
  getEmployeeSalaryHistory,
  getEmployeeFullProfile,
  getEmployeeSummaryCounts,
} = require('../controllers/employee.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

// All Employee routes require authentication and management roles (CHEF blocked)
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'));

// 1. Dashboard summary counts
router.get('/summary/counts', getEmployeeSummaryCounts);

// 2. Attendance & Absent Routes
router.post('/attendance/absent', markAbsent);
router.delete('/attendance/:id', removeAbsent);
router.get('/attendance', getAttendanceRecords);
router.get('/:id/absent-count', getEmployeeAbsentCount);

// 3. Salary Advance Routes
router
  .route('/advance')
  .post(createSalaryAdvance)
  .get(getSalaryAdvances);

router
  .route('/advance/:id')
  .get(getSalaryAdvanceById)
  .put(updateSalaryAdvance);

// 4. Monthly Salary Calculation & Payments
router.get('/salary/summary', getMonthlySalarySummary);
router.get('/salary/payments', getSalaryPayments);
router.post('/salary/pay', paySalary);
router.get('/:id/salary-calculation', getEmployeeSalaryCalculation);
router.get('/:id/salary-history', getEmployeeSalaryHistory);

// 5. Full Employee Profile
router.get('/:id/full-profile', getEmployeeFullProfile);

// 6. Employee Master CRUD
router
  .route('/')
  .post(createEmployee)
  .get(getAllEmployees);

router
  .route('/:id')
  .get(getEmployeeById)
  .put(updateEmployee);

router.patch('/:id/toggle-status', toggleEmployeeStatus);

module.exports = router;
