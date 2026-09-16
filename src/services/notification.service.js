const { messaging } = require('../config/firebase');
const { User } = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Send FCM Push Notification and create In-App Notification record
 * Ensures zero data leaks by strictly filtering targetRoles and targetUsers
 *
 * @param {Object} options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {string} [options.category='SYSTEM'] - CHEF_REQUIREMENT, DAMAGE_REPORT, EXPENSE, SALES, etc.
 * @param {string} [options.type='info'] - info, warning, success, danger, lock
 * @param {Array<string>} [options.targetRoles] - Target roles e.g. ['SUPER_ADMIN', 'MAIN_MANAGER']
 * @param {Array<string|ObjectId>} [options.targetUsers] - Specific user IDs (e.g. only the requesting Chef)
 * @param {string} [options.referenceId] - Associated record ID
 * @param {Object} [options.data] - Additional key-value payload for deep linking
 * @param {string|ObjectId} [options.createdBy] - Creator user ID
 */
async function sendNotification({
  title,
  message,
  category = 'SYSTEM',
  type = 'info',
  targetRoles = [],
  targetUsers = [],
  referenceId = '',
  data = {},
  createdBy = null,
}) {
  try {
    // 1. Create DB In-App Notification Record
    const dbNotif = await Notification.create({
      title,
      message,
      type,
      category,
      targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
      targetUsers: targetUsers.length > 0 ? targetUsers : undefined,
      referenceId: String(referenceId || ''),
      data,
      createdBy,
    });

    // 2. Resolve target FCM Tokens from Users
    const userFilter = { isActive: true };
    const orConditions = [];

    if (targetUsers && targetUsers.length > 0) {
      orConditions.push({ _id: { $in: targetUsers } });
    }
    if (targetRoles && targetRoles.length > 0) {
      orConditions.push({ role: { $in: targetRoles } });
    }

    if (orConditions.length > 0) {
      userFilter.$or = orConditions;
    }

    const recipients = await User.find(userFilter).select('fcmTokens role');
    const tokens = [];
    recipients.forEach((u) => {
      if (u.fcmTokens && u.fcmTokens.length > 0) {
        u.fcmTokens.forEach((t) => {
          if (t.token && !tokens.includes(t.token)) {
            tokens.push(t.token);
          }
        });
      }
    });

    // 3. Send FCM Multicast Message if tokens exist
    if (tokens.length > 0) {
      const fcmPayload = {
        tokens,
        notification: {
          title,
          body: message,
        },
        data: {
          category: String(category),
          type: String(type),
          referenceId: String(referenceId || ''),
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          screen: String(data.screen || category),
          ...Object.keys(data).reduce((acc, k) => {
            acc[k] = String(data[k]);
            return acc;
          }, {}),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'momos_bhandar_ops',
            priority: 'max',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
      };

      if (messaging) {
        const response = await messaging.sendEachForMulticast(fcmPayload);
        console.log(
          `📲 FCM Sent: ${response.successCount} success, ${response.failureCount} failed out of ${tokens.length} tokens`
        );

        // Clean up invalid or expired tokens
        if (response.failureCount > 0) {
          const badTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errCode = resp.error?.code;
              if (
                errCode === 'messaging/invalid-registration-token' ||
                errCode === 'messaging/registration-token-not-registered'
              ) {
                badTokens.push(tokens[idx]);
              }
            }
          });

          if (badTokens.length > 0) {
            await User.updateMany(
              { 'fcmTokens.token': { $in: badTokens } },
              { $pull: { fcmTokens: { token: { $in: badTokens } } } }
            );
          }
        }
      }
    }

    return dbNotif;
  } catch (error) {
    console.error('sendNotification error:', error.message);
    return null;
  }
}

module.exports = {
  sendNotification,
};
