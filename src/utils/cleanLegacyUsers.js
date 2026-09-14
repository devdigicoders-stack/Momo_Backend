const connectDB = require('../config/db');
const { User } = require('../models/User');

const cleanLegacyUsers = async () => {
  try {
    await connectDB();
    const result = await User.deleteMany({
      $or: [
        { email: { $exists: false } },
        { email: null },
        { email: '' }
      ]
    });
    console.log(`Cleaned up ${result.deletedCount} legacy users without emails.`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

cleanLegacyUsers();
