const app = require('./app');
const { connectDB } = require('./config/db');
const env = require('./config/env');

async function start() {
  try {
    await connectDB();
    await require('./config/initDb').initDb();
    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
