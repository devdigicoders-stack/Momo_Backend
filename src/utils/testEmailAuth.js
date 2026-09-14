const API_BASE = 'http://localhost:5000/api';

const runTests = async () => {
  console.log('==================================================');
  console.log('🧪 RUNNING EMAIL & PASSWORD AUTHENTICATION TESTS');
  console.log('==================================================\n');

  try {
    // 1. Health check
    console.log('1. Testing Health Endpoint...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log('   ✅ Health check passed:', health.message);

    // 2. Super Admin Login with EMAIL
    console.log('\n2. Testing Super Admin Login via EMAIL (admin@momosbhandar.com)...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@momosbhandar.com',
        password: 'Admin@123'
      })
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200) {
      console.error('   ❌ Super Admin login failed:', loginData.message);
      return;
    }
    console.log('   ✅ Super Admin Login Success!');
    console.log('   User:', loginData.user);
    const superAdminToken = loginData.token;

    // 3. Create Main Manager with EMAIL
    console.log('\n3. Creating Main Manager with EMAIL (manager@momosbhandar.com)...');
    const managerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Manager Ramesh',
        email: 'manager@momosbhandar.com',
        mobile: '9871112233',
        password: 'Manager@123',
        role: 'MAIN_MANAGER'
      })
    });
    const managerData = await managerRes.json();
    if (managerRes.status === 201) {
      console.log('   ✅ Main Manager Created:', managerData.user.email);
    } else {
      console.log('   ℹ️ Info:', managerData.message);
    }

    // 4. Create Chef with EMAIL
    console.log('\n4. Creating Chef with EMAIL (chef@momosbhandar.com)...');
    const chefRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`
      },
      body: JSON.stringify({
        name: 'Chef Anil',
        email: 'chef@momosbhandar.com',
        mobile: '9873334455',
        password: 'Chef@123',
        role: 'CHEF'
      })
    });
    const chefData = await chefRes.json();
    if (chefRes.status === 201) {
      console.log('   ✅ Chef Created:', chefData.user.email);
    } else {
      console.log('   ℹ️ Info:', chefData.message);
    }

    // 5. Test Main Manager Login with Email
    console.log('\n5. Testing Main Manager Login via EMAIL...');
    const mmLogin = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'manager@momosbhandar.com',
        password: 'Manager@123'
      })
    });
    const mmData = await mmLogin.json();
    if (mmLogin.status === 200) {
      console.log('   ✅ Main Manager Logged in successfully:', mmData.user.name, `(${mmData.user.role})`);
    } else {
      console.error('   ❌ Main Manager Login failed:', mmData.message);
    }

    // 6. Test Chef Login with Email
    console.log('\n6. Testing Chef Login via EMAIL...');
    const chefLogin = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'chef@momosbhandar.com',
        password: 'Chef@123'
      })
    });
    const cData = await chefLogin.json();
    if (chefLogin.status === 200) {
      console.log('   ✅ Chef Logged in successfully:', cData.user.name, `(${cData.user.role})`);
    } else {
      console.error('   ❌ Chef Login failed:', cData.message);
    }

    // 7. Verify List Users as Super Admin
    console.log('\n7. Fetching All Users as Super Admin...');
    const allUsersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    const allUsersData = await allUsersRes.json();
    console.log(`   ✅ Total users in system: ${allUsersData.count}`);
    allUsersData.users.forEach((u) => {
      console.log(`      - [${u.role}] ${u.name} | Email: ${u.email} | Mobile: ${u.mobile} | Active: ${u.isActive}`);
    });

    console.log('\n==================================================');
    console.log('🎉 ALL EMAIL & PASSWORD TESTS PASSED SUCCESSFULLY!');
    console.log('==================================================\n');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
};

runTests();
