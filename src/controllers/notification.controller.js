const Notification = require('../models/Notification');

/**
 * @desc Get Notifications for logged-in user
 * Ensures strict role isolation: user only receives what belongs to their role or direct user ID
 * @route GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user._id;

    const filter = {
      $or: [
        { targetUsers: userId },
        {
          $and: [
            {
              $or: [
                { targetUsers: { $exists: false } },
                { targetUsers: { $size: 0 } },
                { targetUsers: null },
              ],
            },
            {
              $or: [
                { targetRoles: 'ALL' },
                { targetRoles: userRole },
                { targetRoles: { $size: 0 } },
                { targetRoles: { $exists: false } },
              ],
            },
          ],
        },
      ],
    };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('createdBy', 'name role')
      .lean();

    const formatted = notifications.map((n) => ({
      ...n,
      isRead: n.readBy?.some((id) => id.toString() === userId.toString()) || false,
    }));

    const unreadCount = formatted.filter((n) => !n.isRead).length;

    res.status(200).json({
      success: true,
      unreadCount,
      data: formatted,
    });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message,
    });
  }
};

/**
 * @desc Mark all notifications as read for current user
 * @route POST /api/notifications/mark-read
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('markAllAsRead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
      error: error.message,
    });
  }
};
