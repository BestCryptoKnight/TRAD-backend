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
const note = require('./note.route');
const task = require('./task.route');

router.use('/auth', clientAuth);
router.use(authenticate);
router.use('/note', note);
router.use('/task', task);

/**
 * Export Router
 */
module.exports = router;
