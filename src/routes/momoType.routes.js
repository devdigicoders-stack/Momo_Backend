const express = require('express');
const router = express.Router();
const {
  getAllMomoTypes,
  createMomoType,
  updateMomoType,
  toggleMomoTypeStatus,
} = require('../controllers/momoType.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

router
  .route('/')
  .get(authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'), getAllMomoTypes)
  .post(authorize('SUPER_ADMIN'), createMomoType);

router
  .route('/:id')
  .put(authorize('SUPER_ADMIN'), updateMomoType);

router
  .route('/:id/status')
  .patch(authorize('SUPER_ADMIN'), toggleMomoTypeStatus);

module.exports = router;
