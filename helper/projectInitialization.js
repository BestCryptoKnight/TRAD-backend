/*
 * Module Imports
 * */
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Insurer = mongoose.model('insurer');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const config = require('../config');
const MailHelper = require('./mailer.helper');
const Logger = require('../services/logger');
const StaticFile = require('./../static-files/systemModules');
const { createProfile } = require('./illion.helper');

const createSuperAdmin = () => {
  return new Promise(async (resolve, reject) => {
    try {
      let superAdmin = await User.findOne({ email: config.superAdmin.email });
      if (superAdmin) {
        Logger.log.info('Super admin already exists.');
        return resolve();
      }
      let user = new User({
        role: 'superAdmin',
        name: 'Super Admin User',
        email: config.superAdmin.email,
        password: config.superAdmin.password,
        profilePicture: null,
      });
      let organization = await Organization.findOne({ isDeleted: false });
      if (!organization) {
        organization = new Organization({
          name: config.organization.name,
        });
      }
      await organization.save();
      let signUpToken = jwt.sign(
        JSON.stringify({ _id: user._id }),
        config.jwt.secret,
      );
      user.signUpToken = signUpToken;
      user.organizationId = organization._id;
      user.moduleAccess = StaticFile.modules;
      await user.save();
      let mailObj = {
        toAddress: [user.email],
        subject: 'Welcome to TCR',
        text: {
          name: user.name ? user.name : '',
          setPasswordLink:
            config.server.frontendUrls.adminPanelBase +
            config.server.frontendUrls.setPasswordPage +
            user._id +
            '?token=' +
            signUpToken,
        },
        mailFor: 'newAdminUser',
      };
      await MailHelper.sendMail(mailObj);
      Logger.log.info('SuperAdmin created successfully.');
      return resolve();
    } catch (e) {
      Logger.log.error('Error occurred.', e.message || e);
      return reject(e);
    }
  });
};

const createDefaultInsurer = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const defaultInsurer = await Insurer.findOne({
        name: config.organization.insurerName,
      }).lean();
      if (defaultInsurer) {
        Logger.log.info('Insurer already exists');
        return resolve();
      }
      const insurer = new Insurer({
        name: config.organization.insurerName,
        isDefault: true,
      });
      await insurer.save();
      Logger.log.info('Insurer created successfully');
      return resolve();
    } catch (e) {
      Logger.log.error('Error occurred in create insurer ', e.message || e);
      return reject(e);
    }
  });
};

const checkForIllionProfile = async () => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    }).lean();
    if (
      !organization.illionAlertProfile ||
      !organization.illionAlertProfile.profileId
    ) {
      const alertIds = [
        1,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        47,
        48,
        49,
        121,
        122,
        276,
        277,
        278,
        292,
        293,
        294,
      ];
      if (
        organization.integration.illionAlert &&
        organization.integration.illionAlert.userId &&
        organization.integration.illionAlert.password &&
        organization.integration.illionAlert.subscriberId
      ) {
        const response = await createProfile({
          illionAlert: organization.integration.illionAlert,
          alertIds,
          profileName: organization.name,
        });
        if (response && response.profile) {
          await Organization.updateOne(
            { isDeleted: false },
            { $set: { illionAlertProfile: response.profile } },
          );
        }
      }
    } else {
      Logger.log.info('Illion profile already exists.');
    }
  } catch (e) {
    Logger.log.error('Error occurred in check for illion profile');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  createSuperAdmin,
  createDefaultInsurer,
  checkForIllionProfile,
};
