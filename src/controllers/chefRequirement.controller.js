const ChefRequirement = require('../models/ChefRequirement');
const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notification.service');
const { buildDateFilter, getPagination } = require('../utils/queryHelpers');
const { generateEntryCode } = require('../utils/entryCode');
const { logAudit } = require('../utils/auditLogger');
const { validateDateAccess, apply45DayQueryLimit } = require('../middleware/accessControl.middleware');

// @desc    Create new Chef Requirement
// @route   POST /api/chef-requirements
// @access  Private (CHEF, SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.createRequirement = async (req, res) => {
  try {
    const { date, itemName, quantity, unit, priority, remarks } = req.body;

    const targetDate = date || Date.now();

    // Validate Date Access (Chef requirements allow future planning dates, checks 45-day rule for managers & Date Lock)
    const dateValidation = await validateDateAccess({
      dateValue: targetDate,
      user: req.user,
      allowFuture: true,
    });
    if (!dateValidation.isValid) {
      return res.status(dateValidation.status).json({
        success: false,
        message: dateValidation.message,
      });
    }

    if (!itemName || !itemName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Item name is required',
      });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0',
      });
    }

    // Duplicate submission guard (within 5 seconds)
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const duplicate = await ChefRequirement.findOne({
      enteredBy: req.user._id,
      itemName: itemName.trim(),
      quantity: qty,
      createdAt: { $gte: fiveSecondsAgo },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry detected. This requisition was already submitted a moment ago.',
      });
    }

    const entryCode = generateEntryCode('REQ', targetDate);

    const requirement = await ChefRequirement.create({
      date: targetDate,
      itemName: itemName.trim(),
      quantity: qty,
      unit: unit ? unit.trim() : 'KG',
      priority: priority || 'Medium',
      status: 'Pending',
      remarks: remarks || '',
      enteredBy: req.user._id,
      entryCode,
    });

    const populated = await ChefRequirement.findById(requirement._id).populate(
      'enteredBy',
      'name email mobile role'
    );

    // Create In-App Notification and FCM Push for Managers
    await sendNotification({
      title: 'New Chef Requirement',
      message: `${req.user.name} requested ${qty} ${unit || 'KG'} ${itemName.trim()} (Priority: ${priority || 'Medium'})`,
      type: priority === 'Urgent' || priority === 'High' ? 'warning' : 'info',
      category: 'CHEF_REQUIREMENT',
      targetRoles: ['SUPER_ADMIN', 'MAIN_MANAGER', 'MANAGER_2'],
      referenceId: requirement._id,
      data: {
        category: 'CHEF_REQUIREMENT',
        requirementId: requirement._id,
        screen: 'Kitchen Demands',
      },
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Kitchen requirement submitted successfully',
      data: populated,
    });
  } catch (error) {
    console.error('Create chef requirement error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating requirement',
    });
  }
};

// @desc    Get Chef Requirements (Search, Filter, Sort, Pagination)
// @route   GET /api/chef-requirements
// @access  Private
exports.getAllRequirements = async (req, res) => {
  try {
    const {
      search,
      status,
      priority,
      datePreset,
      fromDate,
      toDate,
      myOnly,
      sortBy,
      sortOrder,
    } = req.query;

    const filter = {};

    // Chef always sees own unless permitted otherwise
    if (req.user.role === 'CHEF' || myOnly === 'true') {
      filter.enteredBy = req.user._id;
    }

    // 1. Date filter with 45-day limit for managers
    const dateQuery = buildDateFilter(datePreset, fromDate, toDate);
    if (dateQuery) {
      filter.date = dateQuery;
    }
    apply45DayQueryLimit(req, filter, 'date');

    // 2. Status & Priority
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    // 3. Search item name, remarks, or entryCode
    if (search && search.trim()) {
      filter.$or = [
        { itemName: { $regex: search.trim(), $options: 'i' } },
        { remarks: { $regex: search.trim(), $options: 'i' } },
        { entryCode: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // 4. Sorting
    let sortOptions = { createdAt: -1 };
    if (sortBy === 'priority') {
      sortOptions = { priority: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'status') {
      sortOptions = { status: sortOrder === 'asc' ? 1 : -1 };
    } else if (sortBy === 'oldest') {
      sortOptions = { date: 1, createdAt: 1 };
    } else if (sortBy === 'newest') {
      sortOptions = { date: -1, createdAt: -1 };
    }

    // 5. Pagination
    const { page, limit, skip } = getPagination(req.query);
    const total = await ChefRequirement.countDocuments(filter);

    const requirements = await ChefRequirement.find(filter)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      count: requirements.length,
      data: requirements,
    });
  } catch (error) {
    console.error('Get all requirements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching chef requirements',
    });
  }
};

// @desc    Get single Chef Requirement by ID
// @route   GET /api/chef-requirements/:id
// @access  Private
exports.getRequirementById = async (req, res) => {
  try {
    const requirement = await ChefRequirement.findById(req.params.id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: requirement,
    });
  } catch (error) {
    console.error('Get requirement by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while retrieving requirement',
    });
  }
};

// @desc    Update Chef Requirement (Tracks edit history & accountability)
// @route   PUT /api/chef-requirements/:id
// @access  Private
exports.updateRequirement = async (req, res) => {
  try {
    const { date, itemName, quantity, unit, priority, remarks, status, reason } = req.body;

    const requirement = await ChefRequirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found',
      });
    }

    // Check Date Access (allows future dates, checks 45-day rule & Date Lock)
    const check1 = await validateDateAccess({ dateValue: requirement.date, user: req.user, allowFuture: true });
    if (!check1.isValid) {
      return res.status(check1.status).json({ success: false, message: check1.message });
    }
    if (date) {
      const check2 = await validateDateAccess({ dateValue: date, user: req.user, allowFuture: true });
      if (!check2.isValid) {
        return res.status(check2.status).json({ success: false, message: check2.message });
      }
    }

    // Capture previous snapshot
    const previousSnapshot = {
      date: requirement.date,
      itemName: requirement.itemName,
      quantity: requirement.quantity,
      unit: requirement.unit,
      priority: requirement.priority,
      status: requirement.status,
      remarks: requirement.remarks,
    };

    if (date) requirement.date = date;
    if (itemName) requirement.itemName = itemName.trim();
    if (quantity !== undefined) {
      const q = Number(quantity);
      if (isNaN(q) || q <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be greater than 0',
        });
      }
      requirement.quantity = q;
    }
    if (unit) requirement.unit = unit.trim();
    if (priority) requirement.priority = priority;
    if (remarks !== undefined) requirement.remarks = remarks;

    if (status && req.user.role !== 'CHEF') {
      requirement.status = status;
    }

    requirement.isEdited = true;
    requirement.lastUpdatedBy = req.user._id;
    if (!requirement.entryCode) {
      requirement.entryCode = generateEntryCode('REQ', requirement.date);
    }

    requirement.editHistory.push({
      previousData: previousSnapshot,
      updatedData: {
        date: requirement.date,
        itemName: requirement.itemName,
        quantity: requirement.quantity,
        unit: requirement.unit,
        priority: requirement.priority,
        status: requirement.status,
        remarks: requirement.remarks,
      },
      editedBy: req.user._id,
      editedAt: new Date(),
      reason: reason || 'Operational correction',
    });

    await requirement.save();

    await logAudit({
      req,
      recordId: requirement._id,
      module: 'CHEF_REQUIREMENT',
      entryCode: requirement.entryCode,
      action: 'EDIT',
      originalData: previousSnapshot,
      updatedData: {
        date: requirement.date,
        itemName: requirement.itemName,
        quantity: requirement.quantity,
        unit: requirement.unit,
        priority: requirement.priority,
        status: requirement.status,
        remarks: requirement.remarks,
      },
      reason: reason || 'Operational correction',
    });

    const updated = await ChefRequirement.findById(requirement._id)
      .populate('enteredBy', 'name email mobile role')
      .populate('lastUpdatedBy', 'name email mobile role')
      .populate('editHistory.editedBy', 'name role');

    return res.status(200).json({
      success: true,
      message: 'Requirement updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update requirement error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating requirement',
    });
  }
};

// @desc    Update Status of Chef Requirement
// @route   PATCH /api/chef-requirements/:id/status
// @access  Private (SUPER_ADMIN, MAIN_MANAGER, MANAGER_2)
exports.updateRequirementStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['Pending', 'Approved', 'Rejected', 'Completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (Pending, Approved, Rejected, Completed)',
      });
    }

    const requirement = await ChefRequirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found',
      });
    }

    const previousStatus = requirement.status;
    requirement.status = status;
    await requirement.save();

    await logAudit({
      req,
      recordId: requirement._id,
      module: 'CHEF_REQUIREMENT',
      entryCode: requirement.entryCode,
      action: 'STATUS_CHANGE',
      originalData: { status: previousStatus },
      updatedData: { status },
      reason: `Status changed to ${status}`,
    });

    // Notify specifically and ONLY the chef who requested it (Zero data leakage)
    if (requirement.enteredBy) {
      try {
        await sendNotification({
          title: `Requirement ${status}`,
          message: `Your request for ${requirement.quantity} ${requirement.unit} ${requirement.itemName} has been marked as ${status} by ${req.user.name}.`,
          type: status === 'Approved' ? 'success' : (status === 'Rejected' ? 'danger' : 'info'),
          category: 'CHEF_REQUIREMENT',
          targetUsers: [requirement.enteredBy],
          referenceId: requirement._id,
          data: {
            category: 'CHEF_REQUIREMENT',
            requirementId: requirement._id,
            status,
            screen: 'Kitchen Demands',
          },
          createdBy: req.user._id,
        });
      } catch (notifErr) {
        console.error('Notification creation error:', notifErr);
      }
    }

    const updated = await ChefRequirement.findById(requirement._id).populate(
      'enteredBy',
      'name email mobile role'
    );

    return res.status(200).json({
      success: true,
      message: `Requirement status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error('Update requirement status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating requirement status',
    });
  }
};
