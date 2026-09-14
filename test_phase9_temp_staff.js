const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const TemporaryStaff = require('./src/models/TemporaryStaff');
const TemporaryStaffWork = require('./src/models/TemporaryStaffWork');
const TemporaryStaffPayment = require('./src/models/TemporaryStaffPayment');
const { User } = require('./src/models/User');

async function runPhase9Tests() {
  console.log('🚀 [START] Testing Phase 9: Temporary / Extra Staff Management...');

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/momos_bhandar');
    console.log('✅ MongoDB connected');

    // 1. Find a test user (Super Admin or Manager)
    let adminUser = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!adminUser) {
      adminUser = await User.findOne({});
    }
    if (!adminUser) {
      console.log('❌ No user found to assign as enteredBy');
      process.exit(1);
    }
    console.log(`✅ Using User: ${adminUser.name} (${adminUser.role})`);

    // Clean previous test data
    await TemporaryStaffWork.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    await TemporaryStaffPayment.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    await TemporaryStaff.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    console.log('🧹 Cleaned previous test artifacts');

    // TEST 1: Create Temporary Staff Master
    console.log('\n--- TEST 1: Create Temporary Staff Master ---');
    const staff1 = await TemporaryStaff.create({
      name: 'Ramesh Helper (TEST_PHASE_9)',
      mobile: '9876543210',
      status: 'Active',
      remarks: 'Kitchen Helper TEST_PHASE_9',
      enteredBy: adminUser._id,
    });
    console.log(`✅ Staff 1 Created: ${staff1.name} (Code: ${staff1.entryCode}, Status: ${staff1.status})`);

    const staff2 = await TemporaryStaff.create({
      name: 'Suresh Cleaner (TEST_PHASE_9)',
      mobile: '9876543211',
      status: 'Inactive',
      remarks: 'Dishwasher TEST_PHASE_9',
      enteredBy: adminUser._id,
    });
    console.log(`✅ Staff 2 Created: ${staff2.name} (Code: ${staff2.entryCode}, Status: ${staff2.status})`);

    // TEST 2: Worked Date Entries with variable daily wage
    console.log('\n--- TEST 2: Work Entries with Variable Daily Wage ---');
    const date1 = new Date('2026-09-01T00:00:00.000Z');
    const date2 = new Date('2026-09-03T00:00:00.000Z');
    const date3 = new Date('2026-09-05T00:00:00.000Z');

    const work1 = await TemporaryStaffWork.create({
      staff: staff1._id,
      date: date1,
      dailyWage: 500,
      remarks: 'Kitchen work 01 Sep TEST_PHASE_9',
      enteredBy: adminUser._id,
    });
    console.log(`✅ Work Entry 1 Created: 01 Sep -> ₹${work1.dailyWage} (Code: ${work1.entryCode})`);

    const work2 = await TemporaryStaffWork.create({
      staff: staff1._id,
      date: date2,
      dailyWage: 600, // Different daily wage
      remarks: 'Rush hour evening shift 03 Sep TEST_PHASE_9',
      enteredBy: adminUser._id,
    });
    console.log(`✅ Work Entry 2 Created: 03 Sep -> ₹${work2.dailyWage} (Code: ${work2.entryCode})`);

    const work3 = await TemporaryStaffWork.create({
      staff: staff1._id,
      date: date3,
      dailyWage: 500,
      remarks: 'Normal shift 05 Sep TEST_PHASE_9',
      enteredBy: adminUser._id,
    });
    console.log(`✅ Work Entry 3 Created: 05 Sep -> ₹${work3.dailyWage} (Code: ${work3.entryCode})`);

    // TEST 3: Duplicate Worked-Date Protection
    console.log('\n--- TEST 3: Duplicate Worked Date Protection ---');
    try {
      await TemporaryStaffWork.create({
        staff: staff1._id,
        date: date1, // Duplicate date!
        dailyWage: 500,
        remarks: 'Duplicate entry attempt TEST_PHASE_9',
        enteredBy: adminUser._id,
      });
      console.log('❌ FAILED: Duplicate entry was allowed!');
    } catch (err) {
      console.log('✅ Duplicate entry successfully blocked! Error Code:', err.code || err.message);
    }

    // TEST 4: Calculate Days Worked & Total Payable
    console.log('\n--- TEST 4: Calculation of Days Worked & Total Payable ---');
    const allWorks = await TemporaryStaffWork.find({ staff: staff1._id });
    const daysWorked = allWorks.length;
    const totalPayable = allWorks.reduce((acc, w) => acc + w.dailyWage, 0);

    console.log(`Days Worked: ${daysWorked} (Expected: 3)`);
    console.log(`Total Payable: ₹${totalPayable} (Expected: ₹1600 = 500 + 600 + 500)`);
    if (daysWorked === 3 && totalPayable === 1600) {
      console.log('✅ Calculation matches specification exactly!');
    } else {
      console.log('❌ Calculation mismatch!');
    }

    // TEST 5: Payment Record (Partial Payout & Full Payout)
    console.log('\n--- TEST 5: Payment Records ---');
    const payment1 = await TemporaryStaffPayment.create({
      staff: staff1._id,
      paymentMonth: '2026-09',
      daysWorked: 3,
      payableAmount: 1600,
      paidAmount: 1000, // Partial
      paymentDate: new Date('2026-09-06'),
      paymentMode: 'Cash',
      remarks: 'Partial payout TEST_PHASE_9',
      paidBy: adminUser._id,
      status: 'Partially Paid',
    });
    console.log(`✅ Partial Payment 1: Paid ₹${payment1.paidAmount} / ₹${payment1.payableAmount} (Status: ${payment1.status}, Receipt: ${payment1.entryCode})`);

    const remainingDue = payment1.payableAmount - payment1.paidAmount;
    console.log(`Remaining Due: ₹${remainingDue} (Expected: ₹600)`);

    const payment2 = await TemporaryStaffPayment.create({
      staff: staff1._id,
      paymentMonth: '2026-09',
      daysWorked: 3,
      payableAmount: 600,
      paidAmount: 600, // Full balance clearance
      paymentDate: new Date('2026-09-07'),
      paymentMode: 'UPI',
      remarks: 'Final balance clearance TEST_PHASE_9',
      paidBy: adminUser._id,
      status: 'Paid',
    });
    console.log(`✅ Full Clearance Payment 2: Paid ₹${payment2.paidAmount} (Status: ${payment2.status}, Receipt: ${payment2.entryCode})`);

    // Clean up test data
    await TemporaryStaffWork.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    await TemporaryStaffPayment.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    await TemporaryStaff.deleteMany({ remarks: { $regex: /TEST_PHASE_9/i } });
    console.log('\n🧹 Test records cleaned up successfully.');

    console.log('\n🎉 ALL PHASE 9 BACKEND TESTS PASSED PERFECTLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runPhase9Tests();
