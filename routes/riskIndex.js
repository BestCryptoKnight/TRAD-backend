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
const client = require('./client.risk.route');
const claim = require('./claim.risk.route');
const debtor = require('./debtor.risk.route');
const document = require('./document.risk.route');
const insurer = require('./insurer.risk.route');
const note = require('./note.risk.route');
const organization = require('./organization.route');
const overdue = require('./overdue.risk.route');
const policy = require('./policy.risk.route');
const privilege = require('./privilege.risk.route');
const settings = require('./settings.risk.route');
const task = require('./task.risk.route');
const user = require('./user.route');

router.use('/auth', auth);
router.use('/privilege', privilege);
router.use(authenticate);
router.use(checkModuleAccess);
router.use('/application', application);
router.use('/client', client);
router.use('/claim', claim);
router.use('/debtor', debtor);
router.use('/document', document);
router.use('/insurer', insurer);
router.use('/note', note);
router.use('/organization', organization);
router.use('/overdue', overdue);
router.use('/policy', policy);
router.use('/settings', settings);
router.use('/task', task);
router.use('/user', user);

/**
 * Export Router
 */
module.exports = router;
