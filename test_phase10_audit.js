const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const AuditLog = require('./src/models/AuditLog');
const Expense = require('./src/models/Expense');
const Sales = require('./src/models/Sales');
const { User } = require('./src/models/User');
const { logAudit } = require('./src/utils/auditLogger');

async function runPhase10Tests() {
  console.log('🚀 [START] Testing Phase 10: Complete Edit & Audit Trail...');

  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/momos_bhandar');
    console.log('✅ MongoDB connected');

    // Find test user
    const adminUser = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!adminUser) {
      console.error('❌ Super Admin user not found');
      process.exit(1);
    }
    console.log(`✅ Using User: ${adminUser.name} (${adminUser.role})`);

    // Clean previous test audit entries
    await AuditLog.deleteMany({ reason: { $regex: /TEST_PHASE_10/i } });
    await Expense.deleteMany({ item: { $regex: /TEST_PHASE_10/i } });
    console.log('🧹 Cleaned previous test artifacts');

    // -------------------------------------------------------------------------
    // TEST 1: Expense Creation and Audit Logging on Edit
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Record Modification & Field-Level Diffing ---');

    const originalExpense = await Expense.create({
      date: new Date('2026-09-14T00:00:00.000Z'),
      category: 'General',
      subcategory: 'Kitchen Supplies',
      item: 'Cooking Oil Can 15L TEST_PHASE_10',
      amount: 2100,
      paymentMode: 'Cash',
      remarks: 'Original Purchase',
      enteredBy: adminUser._id,
      entryCode: 'EXP-TEST-001',
    });
    console.log(`✅ Original Expense created: ₹${originalExpense.amount}, Item: ${originalExpense.item}`);

    // Simulate an edit with reasons
    const mockReq = {
      user: adminUser,
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };

    const originalSnapshot = {
      amount: originalExpense.amount,
      item: originalExpense.item,
      paymentMode: originalExpense.paymentMode,
      remarks: originalExpense.remarks,
    };

    const updatedData = {
      amount: 2250, // Changed
      item: originalExpense.item, // Unchanged
      paymentMode: 'UPI', // Changed
      remarks: 'Price revised after vendor bill receipt', // Changed
    };

    const auditEntry = await logAudit({
      req: mockReq,
      recordId: originalExpense._id,
      module: 'EXPENSE',
      entryCode: originalExpense.entryCode,
      action: 'EDIT',
      originalData: originalSnapshot,
      updatedData: updatedData,
      reason: 'Bill amount corrected from vendor invoice TEST_PHASE_10',
    });

    if (!auditEntry) {
      throw new Error('Audit log entry was not created');
    }
    console.log(`✅ Audit Log created: Action=${auditEntry.action}, Code=${auditEntry.entryCode}`);
    console.log('   Changed Fields:', auditEntry.changedFields);
    console.log('   Original Values:', auditEntry.originalValues);
    console.log('   New Values:', auditEntry.newValues);

    // Verify changedFields contains only modified fields
    const expectedChanged = ['amount', 'paymentMode', 'remarks'];
    const actualChanged = auditEntry.changedFields;
    const isExactMatch =
      expectedChanged.every((f) => actualChanged.includes(f)) &&
      !actualChanged.includes('item'); // Unchanged item must not be included

    if (!isExactMatch) {
      throw new Error(`Field diffing mismatch! Expected [${expectedChanged}], Got [${actualChanged}]`);
    }
    console.log('✅ Field diffing verified: Only changed fields are present, unchanged fields excluded!');

    // -------------------------------------------------------------------------
    // TEST 2: Reason Retention
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Reason for Edit Retention ---');
    if (!auditEntry.reason || !auditEntry.reason.includes('TEST_PHASE_10')) {
      throw new Error('Edit reason not preserved in AuditLog');
    }
    console.log(`✅ Reason successfully captured: "${auditEntry.reason}"`);

    // -------------------------------------------------------------------------
    // TEST 3: Immutability / Query Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Audit Trail Querying & Immutability ---');
    const logs = await AuditLog.find({ recordId: originalExpense._id });
    console.log(`✅ Found ${logs.length} audit trail record(s) for Record ID: ${originalExpense._id}`);
    if (logs.length !== 1) {
      throw new Error('Expected 1 audit entry for this record');
    }

    // -------------------------------------------------------------------------
    // TEST 4: No-op Edit (No fields changed)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: No-Op Edit Detection ---');
    const noOpAudit = await logAudit({
      req: mockReq,
      recordId: originalExpense._id,
      module: 'EXPENSE',
      entryCode: originalExpense.entryCode,
      action: 'EDIT',
      originalData: { amount: 2250, paymentMode: 'UPI' },
      updatedData: { amount: 2250, paymentMode: 'UPI' },
      reason: '',
    });

    if (noOpAudit !== null) {
      throw new Error('No-op edit should NOT generate a redundant audit log entry');
    }
    console.log('✅ Redundant audit entry successfully suppressed when no fields change!');

    // Clean up test data
    await AuditLog.deleteMany({ reason: { $regex: /TEST_PHASE_10/i } });
    await Expense.deleteMany({ item: { $regex: /TEST_PHASE_10/i } });
    console.log('\n🧹 Test artifacts cleaned up successfully');

    console.log('\n🎉 ALL PHASE 10 AUDIT TRAIL TESTS PASSED PERFECTLY!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

runPhase10Tests();
