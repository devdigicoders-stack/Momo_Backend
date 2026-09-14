const express = require('express');
const router = express.Router();
const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
} = require('../controllers/expense.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');
const { uploadBill } = require('../middleware/upload.middleware');

router.use(authenticate);

router
  .route('/')
  .post(
    authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
    uploadBill.single('bill'),
    createExpense
  )
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getAllExpenses);

router
  .route('/:id')
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getExpenseById)
  .put(
    authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
    uploadBill.single('bill'),
    updateExpense
  )
  .delete(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), deleteExpense);

module.exports = router;
