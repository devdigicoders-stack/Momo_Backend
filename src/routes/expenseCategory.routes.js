const express = require('express');
const router = express.Router();
const {
  getAllCategories,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
} = require('../controllers/expenseCategory.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

router
  .route('/')
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getAllCategories)
  .post(authorize('SUPER_ADMIN'), createCategory);

router
  .route('/:id')
  .put(authorize('SUPER_ADMIN'), updateCategory);

router
  .route('/:id/status')
  .patch(authorize('SUPER_ADMIN'), toggleCategoryStatus);

module.exports = router;
