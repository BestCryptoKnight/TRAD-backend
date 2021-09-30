/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
let mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFileHelper = require('./../helper/static-file.helper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Gets the Profile
 */
router.get('/profile', async function (req, res) {
  try {
    const clientData = await ClientUser.findById(req.user._id)
      .select({
        name: 1,
        role: 1,
        email: 1,
        contactNumber: 1,
        profileKeyPath: 1,
      })
      .lean();
    clientData.profilePictureUrl = await StaticFileHelper.getPreSignedUrl({
      filePath: clientData.profileKeyPath,
      getCloudFrontUrl: false,
    });
    res.status(200).send({ status: 'SUCCESS', data: clientData });
  } catch (e) {
    Logger.log.error('Error occurred in get profile details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Upload for profile-picture of Client.
 */
router.post(
  '/upload/profile-picture',
  upload.single('profile-picture'),
  async (req, res) => {
    try {
      const clientUser = await ClientUser.findById(req.user._id).lean();
      if (clientUser && clientUser.profileKeyPath) {
        await StaticFileHelper.deleteFile({
          filePath: clientUser.profileKeyPath,
        });
      }
      const s3Response = await StaticFileHelper.uploadFile({
        file: req.file.buffer,
        filePath:
          'users/profile-picture/' + Date.now() + '-' + req.file.originalname,
        fileType: req.file.mimetype,
      });
      await ClientUser.updateOne(
        { _id: req.user._id },
        { profileKeyPath: s3Response.key },
      );
      const profileUrl = await StaticFileHelper.getPreSignedUrl({
        filePath: s3Response.key,
        getCloudFrontUrl: false,
      });
      res.status(200).send({ status: 'success', data: profileUrl });
    } catch (e) {
      Logger.log.error(
        'Error occurred in update profile picture ',
        e.message || e,
      );
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later',
      });
    }
  },
);

/**
 * Updates Client - Profile
 */
router.put('/profile', async function (req, res) {
  try {
    let updateObj = {};
    if (req.body.name) updateObj.name = req.body.name;
    if (req.body.contactNumber)
      updateObj.contactNumber = req.body.contactNumber;
    await ClientUser.findByIdAndUpdate(req.user._id, updateObj, { new: true });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'User profile updated successfully.',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update client profile', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Remove profile-picture of Client.
 */
router.delete('/profile-picture', async (req, res) => {
  try {
    const clientUser = await ClientUser.findById(req.user._id).lean();
    if (clientUser && clientUser?.profileKeyPath) {
      await StaticFileHelper.deleteFile({
        filePath: clientUser.profileKeyPath,
      });
    }
    await ClientUser.updateOne({ _id: req.user._id }, { profileKeyPath: null });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Profile Picture deleted successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in remove client profile ',
      e.message || e,
    );
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
