module.exports = {
  BaseUrl: process.env.BASE_URL || 'http://localhost:3500/',
  frontEndUrl: process.env.FRONTEND_URL || 'http://localhost:4000/',
  server: {
    port: process.env.PORT || 3500,
    logLevel: process.env.LOG_LEVEL || 'all',
    alertLogLevel: process.env.ALERT_LOG_LEVEL || 'all',
    mongoDBConnectionUrl:
      process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/TRAD',
  },
  environment: process.env.ENVIRONMENT || 'local',
  jwtSecret: process.env.JWT_SECRET || 'SimpleJWT',
};
