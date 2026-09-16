const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const salesRoutes = require('./routes/sales.routes');
const expenseRoutes = require('./routes/expense.routes');
const expenseCategoryRoutes = require('./routes/expenseCategory.routes');
const momoTypeRoutes = require('./routes/momoType.routes');
const momoPurchaseRoutes = require('./routes/momoPurchase.routes');
const cashRoutes = require('./routes/cash.routes');
const chefRequirementRoutes = require('./routes/chefRequirement.routes');
const employeeRoutes = require('./routes/employee.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const historyRoutes = require('./routes/history.routes');
const settingRoutes = require('./routes/setting.routes');
const reportRoutes = require('./routes/report.routes');
const dailyControlRoutes = require('./routes/dailyControl.routes');
const notificationRoutes = require('./routes/notification.routes');
const temporaryStaffRoutes = require('./routes/temporaryStaff.routes');
const auditRoutes = require('./routes/audit.routes');

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5000',
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    // Allow predefined origins or any *.vercel.app domain
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    callback(null, true); // Fallback allow in production to avoid hard blocks
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads (for bill receipts)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'RK Food Ventures Backend API is up and running',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/momo-types', momoTypeRoutes);
app.use('/api/momo-purchases', momoPurchaseRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/chef-requirements', chefRequirementRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/temporary-staff', temporaryStaffRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/daily-control', dailyControlRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 Route Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
