require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const seedSuperAdmin = require('./utils/seedSuperAdmin');
const seedMasters = require('./utils/seedMasters');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect Database
    await connectDB();

    // 2. Auto-seed Super Admin if not existing
    await seedSuperAdmin();

    // 3. Auto-seed Phase 2 Masters
    await seedMasters();

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`🚀 RK Food Ventures Server running on port ${PORT}`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Server startup for local development / long-running environments
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
} else {
  // In Vercel serverless environment, connect DB on lambda warm-up
  connectDB().catch((err) => console.error('Vercel cold-start DB connect error:', err));
}

module.exports = app;
