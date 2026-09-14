const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  changeUserRole,
  deleteUser
} = require('../controllers/user.controller');
const authenticate = require('../middleware/auth.middleware');
const authorize = require('../middleware/role.middleware');

// All user management routes require SUPER_ADMIN role
router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/', getAllUsers);
router.post('/', createUser);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.patch('/:id/status', toggleUserStatus);
router.patch('/:id/role', changeUserRole);
router.delete('/:id', deleteUser);

module.exports = router;
