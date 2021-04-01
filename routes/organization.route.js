/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

/**
 * Get origination details
 */
router.get('/details', async function (req, res) {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ name: 1, website: 1, contactNumber: 1, address: 1, email: 1 })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: organization });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting organization details ',
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
