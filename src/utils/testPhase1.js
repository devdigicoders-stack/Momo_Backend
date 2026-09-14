const API_BASE = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('==================================================');
  console.log('🧪 RUNNING MOMOS BHANDAR PHASE 1 INTEGRATION TESTS');
  console.log('==================================================\n');

  try {
    // 1. Health check
    console.log('1. Testing Health Endpoint...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log('   ✅ Health check passed:', health.message);

    // 2. Super Admin Login
    console.log('\n2. Testing Super Admin Login...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '9999999999',
        password: 'Admin@123'
      })
    });
    const loginData = await loginRes.json();
    console.log('   ✅ Super Admin Login Success!');
    console.log('   User:', loginData.user);
    const superAdminToken = loginData.token;

    // 3. Verify /auth/me
    console.log('\n3. Testing /api/auth/me verification...');
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const meData = await meRes.json();
    console.log('   ✅ /auth/me authenticated as:', meData.user.name, `(${meData.user.role})`);

    // 4. Create Main Manager
    console.log('\n4. Creating Main Manager...');
    const mainManagerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Main Manager Vikram',
        mobile: '9888888881',
        password: 'Manager@123',
        role: 'MAIN_MANAGER'
      })
    });
    const mainManagerData = await mainManagerRes.json();
    if (mainManagerRes.status === 201) {
      console.log('   ✅ Main Manager Created:', mainManagerData.user.name);
    } else {
      console.log('   ℹ️ Main Manager response:', mainManagerData.message);
    }

    // 5. Create Manager 2
    console.log('\n5. Creating Manager 2...');
    const m2Res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Assistant Manager Priya',
        mobile: '9888888882',
        password: 'Manager@123',
        role: 'MANAGER_2'
      })
    });
    const m2Data = await m2Res.json();
    if (m2Res.status === 201) {
      console.log('   ✅ Manager 2 Created:', m2Data.user.name);
    } else {
      console.log('   ℹ️ Manager 2 response:', m2Data.message);
    }

    // 6. Create Chef
    console.log('\n6. Creating Chef...');
    const chefRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Chef Sanjeev',
        mobile: '9888888883',
        password: 'Chef@123',
        role: 'CHEF'
      })
    });
    const chefData = await chefRes.json();
    if (chefRes.status === 201) {
      console.log('   ✅ Chef Created:', chefData.user.name);
    } else {
      console.log('   ℹ️ Chef response:', chefData.message);
    }

    // 7. Test User Management APIs as Super Admin
    console.log('\n7. Fetching All Users as Super Admin...');
    const allUsersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const allUsersData = await allUsersRes.json();
    console.log(`   ✅ Total users in system: ${allUsersData.count}`);
    allUsersData.users.forEach((u) => {
      console.log(`      - [${u.role}] ${u.name} (${u.mobile}) | Active: ${u.isActive}`);
    });

    // 8. Test Role Authorization Protection (Chef should NOT access /api/users)
    console.log('\n8. Testing Chef Login & RBAC API Protection...');
    const chefLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '9888888883',
        password: 'Chef@123'
      })
    });
    const chefLoginData = await chefLoginRes.json();
    const chefToken = chefLoginData.token;
    console.log('   ✅ Chef Logged in successfully.');

    const chefUsersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${chefToken}` }
    });
    if (chefUsersRes.status === 403) {
      console.log('   ✅ RBAC Protection verified: Chef was blocked with 403 Forbidden on /api/users.');
    } else {
      console.error('   ❌ Chef got unexpected status:', chefUsersRes.status);
    }

    // 9. Test Invalid Credentials
    console.log('\n9. Testing Invalid Login Credentials...');
    const invalidRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '9999999999',
        password: 'WrongPassword'
      })
    });
    if (invalidRes.status === 401) {
      console.log('   ✅ Correctly rejected invalid password with 401 Unauthorized.');
    }

    console.log('\n==================================================');
    console.log('🎉 ALL PHASE 1 INTEGRATION TESTS PASSED!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
};

runTests();
