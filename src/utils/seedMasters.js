const ExpenseCategory = require('../models/ExpenseCategory');
const MomoType = require('../models/MomoType');

const seedMasters = async () => {
  try {
    // 1. Seed Expense Categories (Groceries, Disposable, Vegetables, Cream and Chaap, Colddrinks, Water, Dairy, Roomali Roti, Cylinder, Staff Expenses, Petrol, Utility Bills, Maintenance & Repairs, Others)
    const requiredCategories = [
      'Groceries',
      'Disposable',
      'Vegetables',
      'Cream and Chaap',
      'Colddrinks',
      'Water',
      'Dairy',
      'Roomali Roti',
      'Cylinder',
      'Staff Expenses',
      'Petrol',
      'Utility Bills',
      'Maintenance & Repairs',
      'Others',
    ];

    for (const catName of requiredCategories) {
      await ExpenseCategory.findOneAndUpdate(
        { name: { $regex: new RegExp(`^${catName}$`, 'i') } },
        { $setOnInsert: { name: catName, isActive: true, subcategories: [] } },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Default Expense Categories synced successfully');

    // 2. Seed Momo Types (Veg: 5.00, Paneer: 6.67, Butter Cheese Sweetcorn: 7.50, Chaap: 7.50, Mushroom: 8.33)
    const defaultMomoTypes = [
      { name: 'Veg', defaultRate: 5.00 },
      { name: 'Paneer', defaultRate: 6.67 },
      { name: 'Butter Cheese Sweetcorn', defaultRate: 7.50 },
      { name: 'Chaap', defaultRate: 7.50 },
      { name: 'Mushroom', defaultRate: 8.33 },
    ];

    const allowedNames = defaultMomoTypes.map((m) => m.name);
    // Delete any momo types not in the allowed 5 list
    await MomoType.deleteMany({
      name: { $nin: allowedNames.map((n) => new RegExp(`^${n}$`, 'i')) },
    });

    for (const mt of defaultMomoTypes) {
      await MomoType.findOneAndUpdate(
        { name: { $regex: new RegExp(`^${mt.name}$`, 'i') } },
        { $set: { name: mt.name, defaultRate: mt.defaultRate, isActive: true } },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Default Momo Types strictly synced (5 varieties)');
  } catch (error) {
    console.error('Error seeding masters:', error);
  }
};

module.exports = seedMasters;
