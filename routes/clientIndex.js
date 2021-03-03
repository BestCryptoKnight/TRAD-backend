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
const note = require('./note.route');
const task = require('./task.route');

router.use('/auth', clientAuth);
router.use(authenticate);
router.use('/application', application);
router.use('/client', client);
router.use('/note', note);
router.use('/task', task);

/**
 * Export Router
 */
module.exports = router;
