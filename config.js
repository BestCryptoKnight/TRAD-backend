let uploadLocations = {
  user: {
    base: 'user-data/',
    profile: 'profile-picture/',
  },
  client: {
    base: 'documents/',
    document: 'client',
  },
  debtor: {
    base: 'documents/',
    document: 'debtor',
  },
  application: {
    base: 'documents/',
    document: 'application',
  },
};

let frontendUrls = {
  adminPanelBase:
    process.env.FRONTEND_ADMIN_URL || 'http://192.168.1.202:4600/',
  clientPanelBase:
    process.env.FRONTEND_CLIENT_URL || 'http://192.168.1.202:4600/',
  setPasswordPage: 'set-password/',
  resetPasswordPage: 'reset/',
  forgotPasswordPage: 'forgot/',
};

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'SimpleJWT',
    expireTime: process.env.JWT_EXPIRE_TIME || '2', //in hrs
  },
  uploadLocations: uploadLocations,
  mailer: {
    fromAddress: process.env.FROM_EMAIL_ADDRESS || 'no-reply@kevit.io',
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    send: process.env.SEND_MAIL || true,
  },
  server: {
    backendServerUrl:
      process.env.BACKEND_SERVER_URL || 'http://localhost:3000/',
    frontendUrls: frontendUrls,
    port: process.env.PORT || 3000,
    logLevel: process.env.LOG_LEVEL || 'all',
    alertLogLevel: process.env.ALERT_LOG_LEVEL || 'all',
    mongoDBConnectionUrl:
      process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/EXPRESS-JUMPSTART',
    webhookUrl: process.env.WEBHOOK_URL,
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
  organization: {
    name: 'Trade Credit Risk',
    insurerName: 'Trade Credit Risk',
  },
  environment: process.env.ENVIRONMENT || 'dev',
  staticServing: {
    bucketName: process.env.S3_BUCKET_NAME,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    region: process.env.S3_REGION,
    expiryTimeInMinutes: process.env.S3_LINK_EXPIRY_IN_MINUTES,
    isCloudFrontEnabled:
      process.env.IS_CLOUD_FRONT_ENABLED === 'true' ? true : false,
    cloudFrontKeyId: process.env.CLOUD_FRONT_KEY_ID,
    cloudFrontUrl: process.env.CLOUD_FRONT_URL,
  },
  illion: {
    environment: process.env.ILLION_ENVIRONMENT,
    apiUrl: process.env.ILLION_API_URL,
  },
};
