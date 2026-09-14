const { User } = require('../models/User');

const seedSuperAdmin = async () => {
  try {
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@momosbhandar.com').toLowerCase().trim();
    const adminMobile = process.env.INITIAL_ADMIN_MOBILE || '9999999999';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123';
    const adminName = process.env.INITIAL_ADMIN_NAME || 'Super Admin';

    let existingAdmin = await User.findOne({
      $or: [
        { email: adminEmail },
        { mobile: adminMobile },
        { role: 'SUPER_ADMIN' }
      ]
    });

    if (!existingAdmin) {
      const superAdmin = new User({
        name: adminName,
        email: adminEmail,
        mobile: adminMobile,
        password: adminPassword,
        role: 'SUPER_ADMIN',
        isActive: true
      });

      await superAdmin.save();
      console.log('----------------------------------------------------');
      console.log('✅ Initial Super Admin Created:');
      console.log(`   Name:     ${adminName}`);
      console.log(`   Email:    ${adminEmail}`);
      console.log(`   Mobile:   ${adminMobile}`);
      console.log(`   Password: ${adminPassword}`);
      console.log(`   Role:     SUPER_ADMIN`);
      console.log('----------------------------------------------------');
    } else {
      // Ensure email exists on legacy record if created before email requirement
      let updated = false;
      if (!existingAdmin.email) {
        existingAdmin.email = adminEmail;
        updated = true;
      }
      if (updated) {
        await existingAdmin.save();
      }
      console.log(`[Seed] Super Admin user exists (Email: ${existingAdmin.email || adminEmail}) - skipping seed.`);
    }
  } catch (error) {
    console.error('[Seed Error] Failed to seed Super Admin:', error.message);
  }
};

module.exports = seedSuperAdmin;

// Standalone CLI execution: node src/utils/seedSuperAdmin.js
if (require.main === module) {
  require('dotenv').config();
  const connectDB = require('../config/db');
  connectDB().then(async () => {
    await seedSuperAdmin();
    console.log('✅ Super Admin seed process completed.');
    process.exit(0);
  }).catch((err) => {
    console.error('❌ Super Admin seed failed:', err);
    process.exit(1);
  });
}
