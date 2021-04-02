/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
let mongoose = require('mongoose');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const authenticate = require('./../middlewares/authenticate').authMiddleWare;
const StaticFileHelper = require('./../helper/static-file.helper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Gets the Profile
 */
router.get('/', authenticate, async function (req, res) {
  try {
    const userData = await User.findById(req.user._id)
      .select({
        name: 1,
        role: 1,
        email: 1,
        contactNumber: 1,
        profileKeyPath: 1,
      })
      .lean();
    userData.profilePictureUrl = await StaticFileHelper.getPreSignedUrl({
      filePath: userData.profileKeyPath,
      getCloudFrontUrl: false,
    });
    res.status(200).send({ status: 'SUCCESS', data: userData });
  } catch (e) {
    Logger.log.error('Error occurred in get user profile ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Upload for profile-picture of User.
 */
router.post(
  '/upload',
  authenticate,
  upload.single('profile-picture'),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id).lean();
      if (user && user.profileKeyPath) {
        await StaticFileHelper.deleteFile({ filePath: user.profileKeyPath });
      }
      const s3Response = await StaticFileHelper.uploadFile({
        file: req.file.buffer,
        filePath:
          'users/profile-picture/' + Date.now() + '-' + req.file.originalname,
        fileType: req.file.mimetype,
      });
      await User.updateOne(
        { _id: req.user._id },
        { profileKeyPath: s3Response.key },
      );
      const profileUrl = await StaticFileHelper.getPreSignedUrl({
        filePath: s3Response.key,
        getCloudFrontUrl: false,
      });
      res.status(200).send({ status: 'success', data: profileUrl });
    } catch (e) {
      Logger.log.error('Error occurred in upload profile ', e.message || e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later',
      });
    }
  },
);

/**
 * Updates User - Profile
 */
router.put('/', authenticate, async function (req, res) {
  const updateObj = {};
  if (req.body.name) updateObj.name = req.body.name;
  if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
  try {
    await User.findByIdAndUpdate(req.user._id, updateObj, { new: true });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'User profile updated successfully.',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update profile', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Remove profile-picture of User.
 */
router.delete('/', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (user && user.profileKeyPath) {
      await StaticFileHelper.deleteFile({ filePath: user.profileKeyPath });
    }
    await User.updateOne({ _id: req.user._id }, { profileKeyPath: null });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Profile Picture deleted successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in remove profile picture ',
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
