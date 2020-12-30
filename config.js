let uploadLocations = {
    user: {
        base: 'user-data/',
        profile: 'profile-picture/',
    },
};

let frontendUrls = {
    superAdminPanelBase: process.env.FRONTEND_ADMIN_URL || 'http://192.168.1.202:4600/',
    adminPanelBase: process.env.FRONTEND_CLIENT_URL || 'http://192.168.1.202:4600/',
    setPasswordPage: 'set/',
    resetPasswordPage: 'reset/',
    forgotPasswordPage: 'forgot/',
};

module.exports = {
    jwtSecret: process.env.JWT_SECRET || 'SimpleJWT',
    uploadLocations: uploadLocations,
    mailer: {
        fromAddress: process.env.FROM_EMAIL_ADDRESS || 'no-reply@kevit.io',
        sendgridApiKey: process.env.SENDGRID_API_KEY,
        send: process.env.SEND_MAIL || true,
    },
    server: {
        backendServerUrl: process.env.BACKEND_SERVER_URL || 'http://localhost:3000/',
        frontendUrls: frontendUrls,
        port: process.env.PORT || 3000,
        logLevel: process.env.LOG_LEVEL || 'all',
        alertLogLevel: process.env.ALERT_LOG_LEVEL || 'all',
        mongoDBConnectionUrl: process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/EXPRESS-JUMPSTART',
        webhookUrl: process.env.WEBHOOK_URL,
    },
    superAdmin: {
        email: process.env.SUPER_ADMIN_EMAIL,
    },
    environment: process.env.ENVIRONMENT || 'dev',
};
