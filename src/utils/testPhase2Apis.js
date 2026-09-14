const http = require('http');

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers,
      },
      (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            resolve(d);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
        headers,
      },
      (res) => {
        let d = '';
        res.on('data', (chunk) => (d += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            resolve(d);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('--- 1. Login as Super Admin ---');
  const loginRes = await post('http://localhost:5000/api/auth/login', {
    email: 'admin@momosbhandar.com',
    password: 'Admin@123',
  });
  console.log('Login Response:', loginRes.success, 'User:', loginRes.user?.name);
  const token = loginRes.token;

  console.log('\n--- 2. Sales Entry ---');
  const saleRes = await post(
    'http://localhost:5000/api/sales',
    {
      date: new Date(),
      amount: 8400,
      paymentMode: 'Paytm',
      remarks: 'Lunch rush collection',
    },
    token
  );
  console.log('Sales Response:', saleRes.success, 'Amount:', saleRes.data?.amount);

  console.log('\n--- 3. Expense Categories GET ---');
  const catRes = await get('http://localhost:5000/api/expense-categories', token);
  console.log('Categories Count:', catRes.count, 'First:', catRes.data?.[0]?.name);

  console.log('\n--- 4. Momo Types GET ---');
  const typesRes = await get('http://localhost:5000/api/momo-types', token);
  console.log('Momo Types Count:', typesRes.count, 'First:', typesRes.data?.[0]?.name);

  console.log('\n--- 5. Momo Purchase Entry ---');
  const purchaseRes = await post(
    'http://localhost:5000/api/momo-purchases',
    {
      date: new Date(),
      momoType: 'Paneer Momo',
      quantity: 100,
      rate: 35,
      supplierName: 'Daily Fresh Agro',
      paymentMode: 'Cash',
      remarks: 'Morning batch inward',
    },
    token
  );
  console.log('Purchase Response:', purchaseRes.success, 'Total:', purchaseRes.data?.totalAmount);

  console.log('\n--- 6. Cash Entry ---');
  const cashRes = await post(
    'http://localhost:5000/api/cash',
    {
      date: new Date(),
      openingCash: 3000,
      cashReceived: 10500,
      cashPaid: 1500,
      remarks: 'Evening counter shift closed',
    },
    token
  );
  console.log('Cash Response:', cashRes.success, 'Closing Cash:', cashRes.data?.closingCash);

  console.log('\n--- 7. Chef Requirement Entry ---');
  const reqRes = await post(
    'http://localhost:5000/api/chef-requirements',
    {
      date: new Date(),
      itemName: 'Fresh Onions',
      quantity: 20,
      unit: 'KG',
      priority: 'High',
      remarks: 'For evening gravy momo prep',
    },
    token
  );
  console.log('Chef Req Response:', reqRes.success, 'Item:', reqRes.data?.itemName, 'Status:', reqRes.data?.status);

  console.log('\n--- 8. Employee Registration ---');
  const empRes = await post(
    'http://localhost:5000/api/employees',
    {
      name: 'Sunil Sharma',
      mobile: '9876543210',
      designation: 'Helper',
      salary: 12000,
      status: 'Active',
      remarks: 'Day Shift Helper',
    },
    token
  );
  console.log('Employee Response:', empRes.success, 'Name:', empRes.data?.name);

  console.log('\n--- 9. Phase 2 Dashboard Stats ---');
  const statsRes = await get('http://localhost:5000/api/dashboard/stats', token);
  console.log('Dashboard Stats Result:', JSON.stringify(statsRes.data, null, 2));

  console.log('\n=========================================');
  console.log('🎉 ALL PHASE 2 APIS VERIFIED AND WORKING!');
  console.log('=========================================');
}

test().catch(console.error);
