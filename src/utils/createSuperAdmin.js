require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const connectDB = require('../config/db');
const { User } = require('../models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const createSuperAdminCLI = async () => {
  console.log('==================================================');
  console.log('👑 MOMOS BHANDAR - CREATE SUPER ADMIN USER SCRIPT');
  console.log('==================================================\n');

  try {
    await connectDB();

    const name = (await question('Enter Super Admin Full Name [Default: Super Admin]: ')).trim() || 'Super Admin';
    const email = (await question('Enter Super Admin Email: ')).trim().toLowerCase();
    const mobile = (await question('Enter 10-digit Mobile Number: ')).trim();
    const password = (await question('Enter Password (min 6 characters): ')).trim();

    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      console.error('\n❌ Error: Please provide a valid email address.');
      process.exit(1);
    }

    if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
      console.error('\n❌ Error: Mobile number must be exactly 10 digits.');
      process.exit(1);
    }

    if (!password || password.length < 6) {
      console.error('\n❌ Error: Password must be at least 6 characters long.');
      process.exit(1);
    }

    // Check duplicate
    const existing = await User.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existing) {
      console.error(`\n❌ Error: A user with this email (${existing.email}) or mobile (${existing.mobile}) already exists!`);
      process.exit(1);
    }

    const superAdmin = new User({
      name,
      email,
      mobile,
      password,
      role: 'SUPER_ADMIN',
      isActive: true
    });

    await superAdmin.save();

    console.log('\n==================================================');
    console.log('🎉 Super Admin Created Successfully!');
    console.log(`   Name:     ${superAdmin.name}`);
    console.log(`   Email:    ${superAdmin.email}`);
    console.log(`   Mobile:   ${superAdmin.mobile}`);
    console.log(`   Role:     ${superAdmin.role}`);
    console.log('==================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create Super Admin:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
};

createSuperAdminCLI();
