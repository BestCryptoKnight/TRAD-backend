/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
// const authenticate = require('./../middlewares/authenticate').authMiddleWare;
const Logger = require('./../services/logger');

router.get('/', async function (req, res) {
  try {
    const user = await ClientUser.findById(req.user._id)
      .select('moduleAccess')
      .lean();
    res.status(200).send({
      status: 'SUCCESS',
      data: user,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting user privileges ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Export Router
 */
module.exports = router;
