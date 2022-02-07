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
  adminPanelBase: process.env.FRONTEND_ADMIN_URL,
  clientPanelBase: process.env.FRONTEND_CLIENT_URL,
  setPasswordPage: 'set-password/',
  resetPasswordPage: 'reset/',
  forgotPasswordPage: 'forgot/',
};

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expireTime: process.env.JWT_EXPIRE_TIME || '2', //in hrs
    linkExpireTime: process.env.JWT_LINK_EXPIRE_TIME || '12', //in hrs
  },
  uploadLocations: uploadLocations,
  mailer: {
    fromAddress: process.env.FROM_EMAIL_ADDRESS,
    replyTo: process.env.REPLY_TO_EMAIL_ADDRESS,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    send: process.env.SEND_MAIL || true,
    isForProduction: process.env.IS_FOR_PRODUCTION || true,
  },
  server: {
    backendServerUrl: process.env.BACKEND_SERVER_URL,
    frontendUrls: frontendUrls,
    port: process.env.PORT || 3000,
    logLevel: process.env.LOG_LEVEL || 'all',
    alertLogLevel: process.env.ALERT_LOG_LEVEL || 'all',
    mongoDBConnectionUrl: process.env.MONGODB_URL,
    webhookUrl: process.env.WEBHOOK_URL,
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
  organization: {
    name: 'Trade Credit Risk',
    insurerName: 'Trade Credit Risk',
    timeZone: 'Australia/Melbourne',
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
    bucketURL: process.env.S3_BUCKET_URL,
  },
  illion: {
    environment: process.env.ILLION_ENVIRONMENT,
    apiUrl: process.env.ILLION_API_URL,
    cronString: '0 1 * * *',
    alertAPIUrl: process.env.ILLION_ALERT_API_URL,
    pdfReportAPIUrl: process.env.ILLION_PDF_REPORT_API_URL,
  },
};
