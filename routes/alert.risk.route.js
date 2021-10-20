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
const { updateProfile } = require('./../helper/illion.helper');
const {
  addImportApplicationEntitiesToProfile,
} = require('./../helper/alert.helper');

/**
 * Update illion profile
 */
router.put('/profile', async function (req, res) {
  if (
    !req.body.profileId ||
    !req.body.profileName ||
    !req.body.profileColour ||
    !req.body.profileAlerts ||
    req.body.profileAlerts.length === 0 ||
    !req.body.hasOwnProperty('locked') ||
    !req.body.hasOwnProperty('useInternalReferenceNumber')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const response = await updateProfile({ requestedData: req.body });
    if (response && response.profile) {
      await Organization.updateOne(
        { isDeleted: false },
        { $set: { illionAlertProfile: response.profile } },
      );
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: 'Profile updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update illion profile', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

router.get('/addToProfile', async function (req, res) {
  try {
    await addImportApplicationEntitiesToProfile();
    res.status(200).send({
      status: 'SUCCESS',
      data: 'Entities added successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in add entities in profile', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Export Router
 */
module.exports = router;
