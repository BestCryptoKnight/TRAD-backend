/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();

/**
 * Import Middlewares
 */
const authenticate = require('./../middlewares/authenticate')
  .clientAuthMiddleWare;

/**
 * Import and Register Routes
 */
const clientAuth = require('./clientAuth.route');
const application = require('./application.route');
const client = require('./client.route');
const claims = require('./claims.route');
const alerts = require('./alerts.route');
const globalSearch = require('./globalSearch.route');
const debtor = require('./debtor.route');
const dashboard = require('./dashboard.route');
const document = require('./document.route');
const entitySearch = require('./entitySearch.route');
const note = require('./note.route');
const notification = require('./notification.route');
const organization = require('./organization.route');
const overdue = require('./overdue.route');
const policy = require('./policy.route');
const task = require('./task.route');
const user = require('./user.route');
const creditLimit = require('./creditLimit.route');
const privilege = require('./privilege.route');
const creditReport = require('./creditReport.route');

router.use('/auth', clientAuth);
router.use('/search', globalSearch);
router.use(authenticate);
router.use('/application', application);
router.use('/client', client);
router.use('/claim', claims);
router.use('/debtor', debtor);
router.use('/dashboard', dashboard);
router.use('/document', document);
router.use('/entity-search', entitySearch);
router.use('/note', note);
router.use('/notification', notification);
router.use('/organization', organization);
router.use('/overdue', overdue);
router.use('/policy', policy);
router.use('/task', task);
router.use('/user', user);
router.use('/credit-limit', creditLimit);
router.use('/privilege', privilege);
router.use('/credit-report', creditReport);
router.use('/alerts', alerts);

/**
 * Export Router
 */
module.exports = router;
