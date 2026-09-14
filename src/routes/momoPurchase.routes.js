const express = require('express');
const router = express.Router();
const {
  createMomoPurchase,
  getAllMomoPurchases,
  getMomoPurchaseById,
  updateMomoPurchase,
  deleteMomoPurchase,
} = require('../controllers/momoPurchase.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

router
  .route('/')
  .post(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), createMomoPurchase)
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getAllMomoPurchases);

router
  .route('/:id')
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getMomoPurchaseById)
  .put(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), updateMomoPurchase)
  .delete(authorize('SUPER_ADMIN', 'MAIN_MANAGER'), deleteMomoPurchase);

module.exports = router;
