const ExpenseCategory = require('../models/ExpenseCategory');
const MomoType = require('../models/MomoType');

const seedMasters = async () => {
  try {
    // 1. Seed Expense Categories
    const categoryCount = await ExpenseCategory.countDocuments();
    if (categoryCount === 0) {
      const defaultCategories = [
        {
          name: 'Raw Material',
          subcategories: [
            { name: 'Vegetables', isActive: true },
            { name: 'Paneer', isActive: true },
            { name: 'Flour / Maida', isActive: true },
            { name: 'Oil & Spices', isActive: true },
            { name: 'Sauces & Condiments', isActive: true },
          ],
        },
        {
          name: 'Staff',
          subcategories: [
            { name: 'Daily Wages', isActive: true },
            { name: 'Temporary Staff', isActive: true },
            { name: 'Staff Meal', isActive: true },
          ],
        },
        {
          name: 'Utility',
          subcategories: [
            { name: 'Electricity', isActive: true },
            { name: 'Commercial Gas Cylinder', isActive: true },
            { name: 'Water Supply', isActive: true },
          ],
        },
        {
          name: 'Rent & Space',
          subcategories: [
            { name: 'Outlet Rent', isActive: true },
            { name: 'Storage Godown', isActive: true },
          ],
        },
        {
          name: 'Transport & Logistics',
          subcategories: [
            { name: 'Auto / Rickshaw Delivery', isActive: true },
            { name: 'Fuel', isActive: true },
          ],
        },
        {
          name: 'Maintenance & Repairs',
          subcategories: [
            { name: 'Steamer / Stove Repair', isActive: true },
            { name: 'Electrical & Plumbing', isActive: true },
            { name: 'Cleaning & Sanitation', isActive: true },
          ],
        },
        {
          name: 'Marketing & Printing',
          subcategories: [
            { name: 'Menu Pamphlets', isActive: true },
            { name: 'Banners & Signage', isActive: true },
          ],
        },
        {
          name: 'Other',
          subcategories: [
            { name: 'Packaging Materials', isActive: true },
            { name: 'Miscellaneous', isActive: true },
          ],
        },
      ];

      await ExpenseCategory.insertMany(defaultCategories);
      console.log('✅ Default Expense Categories seeded successfully');
    }

    // 2. Seed Momo Types
    const momoTypeCount = await MomoType.countDocuments();
    if (momoTypeCount === 0) {
      const defaultMomoTypes = [
        { name: 'Veg Momo', defaultRate: 25 },
        { name: 'Paneer Momo', defaultRate: 35 },
        { name: 'Chicken Momo', defaultRate: 40 },
        { name: 'Corn Cheese Momo', defaultRate: 45 },
        { name: 'Kurkure Momo', defaultRate: 50 },
        { name: 'Special Gravy Momo', defaultRate: 60 },
      ];

      await MomoType.insertMany(defaultMomoTypes);
      console.log('✅ Default Momo Types seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding masters:', error);
  }
};

module.exports = seedMasters;
