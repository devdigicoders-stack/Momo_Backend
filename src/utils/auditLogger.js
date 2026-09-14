const AuditLog = require('../models/AuditLog');

/**
 * Compare two values and determine if they are meaningfully different
 */
const isDifferent = (val1, val2) => {
  if (val1 === undefined && val2 === undefined) return false;
  if (val1 === null && val2 === null) return false;
  if ((val1 === null && val2 !== null) || (val1 !== null && val2 === null)) return true;

  // Compare Dates
  if (val1 instanceof Date || val2 instanceof Date) {
    const d1 = val1 ? new Date(val1).getTime() : null;
    const d2 = val2 ? new Date(val2).getTime() : null;
    return d1 !== d2;
  }

  // Compare ObjectIds / Objects
  if (typeof val1 === 'object' && typeof val2 === 'object') {
    if (val1 && val1.toString && val2 && val2.toString) {
      return val1.toString() !== val2.toString();
    }
  }

  // Compare Numbers (handle string numbers vs number)
  if (typeof val1 === 'number' || typeof val2 === 'number') {
    return Number(val1) !== Number(val2);
  }

  // General string comparison (trimmed)
  return String(val1 || '').trim() !== String(val2 || '').trim();
};

/**
 * Log an audit trail entry for create, edit, delete, or cancel actions
 *
 * @param {Object} params
 * @param {Object} params.req Express request object (to extract user and IP)
 * @param {String|ObjectId} params.recordId The ID of the modified document
 * @param {String} params.module The module name (e.g. 'EXPENSE', 'SALES')
 * @param {String} params.entryCode The human-readable entry code
 * @param {String} params.action 'CREATE' | 'EDIT' | 'DELETE' | 'CANCELLED' | 'STATUS_CHANGE'
 * @param {Object} params.originalData Snapshot before change
 * @param {Object} params.updatedData Snapshot after change
 * @param {String} params.reason User-provided or system reason for change
 */
const logAudit = async ({
  req,
  recordId,
  module: moduleName,
  entryCode = '',
  action = 'EDIT',
  originalData = {},
  updatedData = {},
  reason = '',
}) => {
  try {
    const performedBy = req?.user?._id || req?.user?.id;
    if (!performedBy) {
      console.warn('[AuditLogger] No authenticated user found to log audit action');
      return null;
    }

    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.connection?.remoteAddress ||
      req?.socket?.remoteAddress ||
      '';

    const changedFields = [];
    const originalValues = {};
    const newValues = {};

    if (action === 'EDIT' || action === 'STATUS_CHANGE') {
      // Find all changed keys
      const allKeys = new Set([...Object.keys(originalData), ...Object.keys(updatedData)]);

      allKeys.forEach((key) => {
        // Skip metadata fields
        if (
          [
            '_id',
            '__v',
            'createdAt',
            'updatedAt',
            'isEdited',
            'lastUpdatedBy',
            'editHistory',
            'enteredBy',
          ].includes(key)
        ) {
          return;
        }

        const origVal = originalData[key];
        const newVal = updatedData[key];

        if (isDifferent(origVal, newVal)) {
          changedFields.push(key);
          originalValues[key] = origVal !== undefined ? origVal : null;
          newValues[key] = newVal !== undefined ? newVal : null;
        }
      });

      // If no actual field differences found in an EDIT action, don't create a useless audit log
      if (changedFields.length === 0 && !reason) {
        return null;
      }
    } else if (action === 'CREATE') {
      changedFields.push('ALL_INITIAL_FIELDS');
      Object.assign(newValues, updatedData);
    } else if (action === 'DELETE' || action === 'CANCELLED') {
      changedFields.push('RECORD_STATUS');
      Object.assign(originalValues, originalData);
      newValues.status = action === 'CANCELLED' ? 'CANCELLED' : 'DELETED';
    }

    const auditEntry = await AuditLog.create({
      recordId,
      module: moduleName,
      entryCode,
      action,
      changedFields,
      originalValues,
      newValues,
      reason: reason ? String(reason).trim() : '',
      performedBy,
      timestamp: new Date(),
      ipAddress: String(ipAddress),
    });

    return auditEntry;
  } catch (err) {
    console.error('[AuditLogger Error]: Failed to save audit log:', err.message);
    return null;
  }
};

module.exports = {
  logAudit,
  isDifferent,
};
