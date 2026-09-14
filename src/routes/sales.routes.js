const express = require('express');
const router = express.Router();
const {
  createSales,
  getAllSales,
  getSalesById,
  updateSales,
  deleteSales,
} = require('../controllers/sales.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

// Only Super Admin & Main Manager can access Sales (MANAGER_2 is strictly excluded)
router
  .route('/')
  .post(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), createSales)
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), getAllSales);

router
  .route('/:id')
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), getSalesById)
  .put(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), updateSales)
  .delete(authorize('SUPER_ADMIN'), deleteSales);

module.exports = router;
