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
        subject: 'Welcome to TRAD',
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

module.exports = {
  createSuperAdmin,
  createDefaultInsurer,
};
