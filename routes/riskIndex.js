/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/**
 * Import Middlewares
 */
const authenticate = require('./../middlewares/authenticate').authMiddleWare;
const checkModuleAccess = require('./../middlewares/authenticate')
  .checkModuleAccess;

/**
 * Import and Register Routes
 */
const auth = require('./adminAuth.route');
const application = require('./application.risk.route');
const alert = require('./alert.risk.route');
const alerts = require('./alerts.risk.route');
const client = require('./client.risk.route');
const claim = require('./claim.risk.route');
const debtor = require('./debtor.risk.route');
const creditReport = require('./creditReport.risk.route');
const dashboard = require('./dashboard.risk.route');
const document = require('./document.risk.route');
const entitySearch = require('./entitySearch.route');
const globalSearch = require('./globalSearch.risk.route');
const importApplicationDump = require('./import-application-dump.risk.route');
const insurer = require('./insurer.risk.route');
const note = require('./note.risk.route');
const notification = require('./notification.risk.route');
const organization = require('./organization.risk.route');
const overdue = require('./overdue.risk.route');
const profile = require('./profile.risk.route');
const policy = require('./policy.risk.route');
const privilege = require('./privilege.risk.route');
const report = require('./report.risk.route');
const settings = require('./settings.risk.route');
const task = require('./task.risk.route');
const user = require('./user.risk.route');

router.use('/auth', auth);
router.use('/privilege', privilege);
router.use('/profile', profile);
router.use('/search', globalSearch);
router.use(authenticate);
router.use(checkModuleAccess);
router.use('/application', application);
router.use('/client', client);
router.use('/claim', claim);
router.use('/credit-report', creditReport);
router.use('/dashboard', dashboard);
router.use('/debtor', debtor);
router.use('/document', document);
router.use('/entity-search', entitySearch);
router.use('/import-application-dump', importApplicationDump);
router.use('/insurer', insurer);
router.use('/note', note);
router.use('/notification', notification);
router.use('/organization', organization);
router.use('/overdue', overdue);
router.use('/policy', policy);
router.use('/report', report);
router.use('/settings', settings);
router.use('/task', task);
router.use('/user', user);
router.use('/alert', alert);
router.use('/alerts', alerts);

/**
 * Export Router
 */
module.exports = router;
