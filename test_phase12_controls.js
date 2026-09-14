const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const Sales = require('./src/models/Sales');
const Expense = require('./src/models/Expense');
const MomoPurchase = require('./src/models/MomoPurchase');
const MomoType = require('./src/models/MomoType');
const DailyStatus = require('./src/models/DailyStatus');
const { User } = require('./src/models/User');
const { validateDateAccess, apply45DayQueryLimit } = require('./src/middleware/accessControl.middleware');

async function runPhase12Tests() {
  console.log('🚀 [START] Testing Phase 12: 45-Day Access, Final Controls & Production Readiness...');

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/momos_bhandar');
    console.log('✅ MongoDB connected');

    // 1. Fetch test users
    const adminUser = await User.findOne({ role: 'SUPER_ADMIN' });
    const managerUser = await User.findOne({ role: 'MAIN_MANAGER' }) || { _id: new mongoose.Types.ObjectId(), role: 'MAIN_MANAGER', name: 'Mock Manager' };
    const manager2User = await User.findOne({ role: 'MANAGER_2' }) || { _id: new mongoose.Types.ObjectId(), role: 'MANAGER_2', name: 'Mock Manager 2' };

    console.log(`✅ Using Super Admin: ${adminUser.name}`);
    console.log(`✅ Using Main Manager: ${managerUser.name}`);
    console.log(`✅ Using Manager 2: ${manager2User.name}`);

    // Clean test records
    await Sales.deleteMany({ remarks: { $regex: /TEST_PHASE_12/i } });
    await Expense.deleteMany({ item: { $regex: /TEST_PHASE_12/i } });
    await MomoPurchase.deleteMany({ remarks: { $regex: /TEST_PHASE_12/i } });
    await DailyStatus.deleteMany({ date: '2026-09-10' });
    console.log('🧹 Cleaned previous test artifacts');

    // -------------------------------------------------------------------------
    // TEST 1: Future Date Prevention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Future Date Prevention ---');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);

    const futureCheck = await validateDateAccess({
      dateValue: tomorrow,
      user: managerUser,
      allowFuture: false,
    });

    if (futureCheck.isValid) {
      throw new Error('Future date was unexpectedly allowed for financial operation!');
    }
    console.log(`✅ Future date correctly rejected! Status: ${futureCheck.status}, Message: "${futureCheck.message}"`);

    // -------------------------------------------------------------------------
    // TEST 2: 45-Day Rolling Limit for Managers
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: 45-Day Rolling Limit for Managers ---');
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const manager45DayCheck = await validateDateAccess({
      dateValue: sixtyDaysAgo,
      user: managerUser,
      allowFuture: false,
    });

    if (manager45DayCheck.isValid) {
      throw new Error('Date older than 45 days was unexpectedly allowed for MAIN_MANAGER!');
    }
    console.log(`✅ Manager date older than 45 days correctly rejected! Status: ${manager45DayCheck.status}, Message: "${manager45DayCheck.message}"`);

    // -------------------------------------------------------------------------
    // TEST 3: Super Admin Historical Access (>45 days allowed)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Super Admin Historical Access Bypass ---');
    const admin45DayCheck = await validateDateAccess({
      dateValue: sixtyDaysAgo,
      user: adminUser,
      allowFuture: false,
    });

    if (!admin45DayCheck.isValid) {
      throw new Error(`Super Admin was unexpectedly blocked from historical date: ${admin45DayCheck.message}`);
    }
    console.log('✅ Super Admin historical access successfully permitted without 45-day restriction!');

    // -------------------------------------------------------------------------
    // TEST 4: Date Lock Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Date Lock Enforcement ---');
    const lockedDateStr = '2026-09-10';
    await DailyStatus.create({
      date: lockedDateStr,
      status: 'LOCKED',
      notes: 'Locked by Super Admin for Month-End Audit',
      lockedBy: adminUser._id,
      lockedAt: new Date(),
    });

    const managerLockCheck = await validateDateAccess({
      dateValue: new Date(lockedDateStr),
      user: managerUser,
      allowFuture: false,
    });

    if (managerLockCheck.isValid) {
      throw new Error('Locked date was unexpectedly allowed for Manager!');
    }
    console.log(`✅ Manager modification on locked date rejected! Status: ${managerLockCheck.status}, Message: "${managerLockCheck.message}"`);

    const adminLockCheck = await validateDateAccess({
      dateValue: new Date(lockedDateStr),
      user: adminUser,
      allowFuture: false,
    });

    if (!adminLockCheck.isValid) {
      throw new Error('Super Admin should be permitted to override locked date!');
    }
    console.log('✅ Super Admin override on locked date verified!');

    // -------------------------------------------------------------------------
    // TEST 5: Query Filter Clamping
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Query Filter 45-Day Clamping ---');
    const mockReqManager = { user: managerUser };
    const queryFilter = { date: { $gte: new Date('2025-01-01') } };

    apply45DayQueryLimit(mockReqManager, queryFilter, 'date');

    const fortyFiveDaysAgoExpected = new Date();
    fortyFiveDaysAgoExpected.setDate(fortyFiveDaysAgoExpected.getDate() - 45);
    fortyFiveDaysAgoExpected.setHours(0, 0, 0, 0);

    const clampedTime = new Date(queryFilter.date.$gte).getTime();
    const expectedTime = fortyFiveDaysAgoExpected.getTime();

    if (Math.abs(clampedTime - expectedTime) > 2000) {
      throw new Error(`Query clamping failed! Expected ~${fortyFiveDaysAgoExpected.toISOString()}, Got: ${new Date(clampedTime).toISOString()}`);
    }
    console.log(`✅ Query filter successfully clamped to 45-day window: ${new Date(clampedTime).toISOString()}`);

    // -------------------------------------------------------------------------
    // TEST 6: Momo Rate Historical Safety
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Momo Rate Safety & Immutability ---');
    // 1. Create or retrieve Momo Type
    let testMomo = await MomoType.findOne({ name: 'Steamed Paneer Momo' });
    if (!testMomo) {
      testMomo = await MomoType.create({
        name: 'Steamed Paneer Momo',
        defaultRate: 40,
        enteredBy: adminUser._id,
      });
    }

    // 2. Create Momo Purchase with current rate = 40, qty = 50 -> total = 2000
    const purchase = await MomoPurchase.create({
      date: new Date(),
      momoType: testMomo.name,
      quantity: 50,
      rate: 40,
      totalAmount: 2000,
      paymentMode: 'Cash',
      remarks: 'TEST_PHASE_12 purchase',
      enteredBy: adminUser._id,
      entryCode: 'MOM-TEST-12',
    });
    console.log(`✅ Purchase created at Rate ₹${purchase.rate}, Total: ₹${purchase.totalAmount}`);

    // 3. Update Master MomoType rate to ₹55
    testMomo.defaultRate = 55;
    await testMomo.save();
    console.log(`✅ Master Momo Type rate updated to ₹${testMomo.defaultRate}`);

    // 4. Verify existing purchase is completely unaffected
    const fetchedPurchase = await MomoPurchase.findById(purchase._id);
    if (fetchedPurchase.rate !== 40 || fetchedPurchase.totalAmount !== 2000) {
      throw new Error(`Historical purchase was mutated! Rate: ${fetchedPurchase.rate}, Total: ${fetchedPurchase.totalAmount}`);
    }
    console.log(`✅ Historical purchase unchanged! Rate remains ₹${fetchedPurchase.rate}, Total remains ₹${fetchedPurchase.totalAmount}`);

    // Cleanup
    await Sales.deleteMany({ remarks: { $regex: /TEST_PHASE_12/i } });
    await Expense.deleteMany({ item: { $regex: /TEST_PHASE_12/i } });
    await MomoPurchase.deleteMany({ remarks: { $regex: /TEST_PHASE_12/i } });
    await DailyStatus.deleteMany({ date: '2026-09-10' });
    console.log('\n🧹 Test artifacts cleaned up successfully');

    console.log('\n🎉 ALL PHASE 12 CONTROLS & SECURITY TESTS PASSED PERFECTLY!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

runPhase12Tests();
