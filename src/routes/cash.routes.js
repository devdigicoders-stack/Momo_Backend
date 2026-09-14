const express = require('express');
const router = express.Router();
const {
  getCashSummary,
  getAvailableCash,
  getUnifiedTransactions,
  createAdditionalCash,
  getAdditionalCashList,
  getAdditionalCashById,
  updateAdditionalCash,
  createCashDeposit,
  getCashDepositList,
  getCashDepositById,
  updateCashDeposit,
  createCashEntry,
  getCashEntries,
  getCashEntryById,
  updateCashEntry,
} = require('../controllers/cash.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');
const { uploadDepositSlip } = require('../middleware/upload.middleware');

// All cash routes require authentication and manager/admin role (CHEF excluded)
router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'));

// Summary & Live Calculations
router.get('/summary', getCashSummary);
router.get('/available', getAvailableCash);
router.get('/transactions', getUnifiedTransactions);

// Additional Cash Received
router
  .route('/additional')
  .post(createAdditionalCash)
  .get(getAdditionalCashList);

router
  .route('/additional/:id')
  .get(getAdditionalCashById)
  .put(updateAdditionalCash);

// Cash Deposits (Bank)
router
  .route('/deposit')
  .post(uploadDepositSlip.single('depositSlip'), createCashDeposit)
  .get(getCashDepositList);

router
  .route('/deposit/:id')
  .get(getCashDepositById)
  .put(uploadDepositSlip.single('depositSlip'), updateCashDeposit);

// Legacy Snapshots
router
  .route('/')
  .post(createCashEntry)
  .get(getCashEntries);

router
  .route('/:id')
  .get(getCashEntryById)
  .put(updateCashEntry);

module.exports = router;
