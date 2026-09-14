const ExpenseCategory = require('../models/ExpenseCategory');

// @desc    Get all Expense Categories & Subcategories
// @route   GET /api/expense-categories
// @access  Private
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await ExpenseCategory.find().sort({ name: 1 });
    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching expense categories',
    });
  }
};

// @desc    Create new Expense Category
// @route   POST /api/expense-categories
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.createCategory = async (req, res) => {
  try {
    const { name, subcategories } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const existingCategory = await ExpenseCategory.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: `Category "${name}" already exists`,
      });
    }

    const parsedSubcategories = Array.isArray(subcategories)
      ? subcategories
          .filter((sub) => sub && (typeof sub === 'string' ? sub.trim() : sub.name?.trim()))
          .map((sub) => ({
            name: typeof sub === 'string' ? sub.trim() : sub.name.trim(),
            isActive: true,
          }))
      : [];

    const category = await ExpenseCategory.create({
      name: name.trim(),
      subcategories: parsedSubcategories,
      enteredBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Expense category created successfully',
      data: category,
    });
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while creating expense category',
    });
  }
};

// @desc    Update an Expense Category & its subcategories
// @route   PUT /api/expense-categories/:id
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.updateCategory = async (req, res) => {
  try {
    const { name, subcategories, isActive } = req.body;

    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    if (name && name.trim()) {
      category.name = name.trim();
    }

    if (isActive !== undefined) {
      category.isActive = Boolean(isActive);
    }

    if (Array.isArray(subcategories)) {
      category.subcategories = subcategories.map((sub) => ({
        name: typeof sub === 'string' ? sub.trim() : sub.name?.trim() || '',
        isActive: sub.isActive !== undefined ? Boolean(sub.isActive) : true,
      })).filter((s) => s.name.length > 0);
    }

    await category.save();

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: category,
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating category',
    });
  }
};

// @desc    Toggle Category status (Active/Inactive)
// @route   PATCH /api/expense-categories/:id/status
// @access  Private (SUPER_ADMIN, MAIN_MANAGER)
exports.toggleCategoryStatus = async (req, res) => {
  try {
    const category = await ExpenseCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    return res.status(200).json({
      success: true,
      message: `Category marked as ${category.isActive ? 'Active' : 'Inactive'}`,
      data: category,
    });
  } catch (error) {
    console.error('Toggle category status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while toggling category status',
    });
  }
};
