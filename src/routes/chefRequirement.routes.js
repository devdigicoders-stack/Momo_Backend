const express = require('express');
const router = express.Router();
const {
  createRequirement,
  getAllRequirements,
  getRequirementById,
  updateRequirement,
  updateRequirementStatus,
} = require('../controllers/chefRequirement.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

router.use(authenticate);

router
  .route('/')
  .post(
    authorize('CHEF', 'SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
    createRequirement
  )
  .get(
    authorize('CHEF', 'SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
    getAllRequirements
  );

router
  .route('/:id')
  .get(getRequirementById)
  .put(updateRequirement);

router
  .route('/:id/status')
  .patch(
    authorize('SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'),
    updateRequirementStatus
  );

module.exports = router;
