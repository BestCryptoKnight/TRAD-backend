/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

/**
 * Get origination details
 */
router.get('/details', async function (req, res) {
  try {
    const promiseArr = [];
    promiseArr.push(Organization.findOne({
      isDeleted: false,
    })
      .select({ name: 1, website: 1, contactNumber: 1, address: 1, email: 1 })
      .lean());
    promiseArr.push(Client.findOne({
      _id: req.user.clientId,
    })
      .select({ riskAnalystId: 1, serviceManagerId: 1 })
      .populate([{ path: 'riskAnalystId', options: {select: 'name'}}, { path: 'serviceManagerId', options: {select: 'name'}}])
      .lean());
    const [organization, client] = await Promise.all(promiseArr);
    if(client && client.riskAnalystId && client.riskAnalystId.name) {
      organization.riskAnalyst = client.riskAnalystId.name;
    }
    if(client && client.serviceManagerId && client.serviceManagerId.name) {
      organization.serviceManager = client.serviceManagerId.name;
    }
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
