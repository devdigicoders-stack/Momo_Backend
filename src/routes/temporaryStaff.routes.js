const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/temporaryStaff.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

// All Temporary Staff routes require authentication and management roles (CHEF blocked)
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'));

// 1. Temporary Staff Master CRUD
router.route('/').get(getTemporaryStaffList).post(createTemporaryStaff);
router.route('/:id').put(updateTemporaryStaff);

// 2. Work Entries (Worked Dates)
router.route('/work/entries').get(getWorkEntries).post(createWorkEntry);
router.route('/work/entries/:id').put(updateWorkEntry).delete(deleteWorkEntry);

// 3. Summary & Payout Calculations
router.get('/summary/overview', getTemporaryStaffSummary);

// 4. Payments
router.route('/payments/records').get(getPayments).post(createPayment);

// 5. Staff 360 Profile
router.get('/profile/:id', getStaffProfile);

module.exports = router;
