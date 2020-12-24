const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Organization = mongoose.model('organization');
const Logger = require('../services/logger');
const MailHelper = require('./../helper/mailer.helper');
const config = require('../config');
const jwt = require('jsonwebtoken');

/**
 * Creates User - Sign-up Call
 */
router.post('/sign-up', async (req, res) => {
  if (!req.body.email || !req.body.password) {
    return res.status(400).json({
      status: 'EMAIL_OR_PASSWORD_NOT_FOUND',
      message: 'Please enter email and password.',
    });
  }
  try {
    let existingUser = await User.findOne({
      email: req.body.email,
      isArchived: false,
    });
    if (existingUser) {
      return res.status(400).json({
        status: 'USER_WITH_EMAIL_EXISTS',
        message: 'User with this email already exist in the system.',
      });
    }
    let user = new User({
      email: req.body.email,
      password: req.body.password,
    });
    let organization = new Organization({});
    user.organizationId = organization._id;
    await user.save();
    await organization.save();
    res.status(200).json({
      status: 'SUCCESS',
      message: 'Successfully signed up.',
    });
  } catch (e) {
    Logger.log.error('Error in sign-up API call', e.message || e);
    res.status(500).json({
      status: 'Error',
      message: error.message,
    });
  }
});

/**
 * Call for Login
 */
router.post('/login', async (req, res) => {
  let userId = req.body.email;
  let password = req.body.password;
  try {
    let user = await User.findByCredentials(userId, password);
    if (!user) {
      return res.status(400).send({
        status: 'USER_NOT_FOUND',
        message: 'Incorrect email or password.',
      });
    }
    let token = user.getAuthToken();
    res.status(200).json({
      status: 'SUCCESS',
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        contactNumber: user.contactNumber,
        _id: user._id,
        token: token,
        // userRole: user.userRole,
      },
    });
  } catch (e) {
    Logger.log.error('Error in login API call', e.message || e);
    res.status(500).json({
      status: e.status || 'ERROR',
      message: e.message,
    });
  }
});

/**
 * Forget Password
 */
router.post('/forget-password', async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({
      status: 'EMAIL_NOT_FOUND',
      message: 'Email not found',
    });
  }
  try {
    let user = await User.findOne({ email: req.body.email, isArchived: false });
    if (!user) {
      Logger.log.warn(
        'For forget password, user not found in the database with the email:',
        req.body.email,
      );
      return res.status(200).json({
        status: 'SUCCESS',
        message:
          'If user exists then mail with reset password link will be sent.',
      });
    } else {
      let data = await User.sendOTP(user);
      let mailObj = {
        toAddress: [req.body.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.sentOTP,
        },
        mailFor: 'forgotPassword',
      };
      await MailHelper.sendMail(mailObj);
      res.status(200).json({
        status: 'SUCCESS',
        message:
          'If user exists then mail with reset password link will be sent.',
        id: user._id,
      });
    }
  } catch (e) {
    Logger.log.error('Error in forget-password API call', e.message || e);
    res.status(500).json({
      status: 'ERROR',
      message: e.message,
    });
  }
});

router.post('/verify-otp', async (req, res) => {
  if (!req.body.sentOTP || !mongoose.isValidObjectId(req.body._id)) {
    return res.status(400).json({
      status: 'MISSING_REQUIRED_FIELDS',
      message: 'Something went wrong, please try the process from beginning.',
    });
  }
  try {
    let user = await User.findById(mongoose.Types.ObjectId(req.body._id));
    if (!user) {
      return res.status(400).json({
        status: 'USER_NOT_EXIST',
        message: 'User not found',
      });
    }
    let sentOTP = req.body.sentOTP;
    let otpExpired =
      new Date(user.otpExpireTime).getTime() < new Date().getTime();
    if (otpExpired) {
      res.status(400).json({
        status: 'OTP_EXPIRED',
        message: 'otp expired',
      });
    } else if (user.sentOTP && user.sentOTP.toString() === sentOTP.toString()) {
      await User.removeOTP(user);
      let token = jwt.sign(
        JSON.stringify({
          _id: user._id,
          timeStamp: Date.now(),
        }),
        config.jwtSecret,
      );
      res.status(200).json({
        id: user._id,
        token: token,
        status: 'SUCCESS',
      });
    } else {
      res.status(400).json({
        status: 'WRONG_OTP',
        message: 'Wrong otp',
      });
    }
  } catch (e) {
    Logger.log.error('Error in verify-otp API call', e.message || e);
    res.status(500).json({
      status: 'ERROR',
      message: e.message,
    });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  if (!req.body.token || !req.body.password) {
    return res.status(400).json({
      status: 'MISSING_REQUIRED_FIELDS',
      message: 'Something went wrong, please try the process from beginning.',
    });
  }
  try {
    jwt.verify(req.body.token, config.jwtSecret, async (err, decoded) => {
      if (err) {
        Logger.log.warn(
          'JWT - Authentication failed. Error in decoding token.',
        );
        return res.status(401).json({
          status: 'ERROR',
          message:
            'Authentication failed. Please repeat the process from beginning.',
        });
      } else {
        let validTime = decoded.timeStamp + 30 * 60 * 1000;
        if (validTime < Date.now()) {
          Logger.log.warn('AUTH - token expired. user id:' + decoded._id);
          return res.status(401).json({
            status: 'LINK_EXPIRED',
            message:
              'The link to reset password has expired, please repeat the process by clicking on Forget Password from login page.',
          });
        } else if (decoded._id !== req.params.id) {
          Logger.log.warn('AUTH - Invalid id:' + req.params.id);
          return res.status(401).json({
            status: 'AUTH_FAIL',
            message: 'Invalid request, please repeat process from beginning.',
          });
        } else {
          let user = await User.findById(decoded._id);
          if (!user) {
            return res.status(400).json({
              status: 'USER_NOT_EXIST',
              message: 'No user for the given mail id found',
            });
          }
          user.password = req.body.password;
          await user.save();
          res.status(200).json({
            status: 'SUCCESS',
            message: 'Password changed successfully',
          });
        }
      }
    });
  } catch (e) {
    Logger.log.error('Error in reset-password API call', e.message || e);
    res.status(500).json({
      status: 'ERROR',
      message: e.message,
    });
  }
});

/**
 * Resend OTP
 */
router.put('/resend-otp/:id', async (req, res) => {
  if (!req.params.id || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      status: 'USER_NOT_FOUND',
      message: 'User not found, please repeat process from beginning',
    });
  }
  try {
    let user = await User.findById(req.params.id);
    if (!user) {
      Logger.log.warn(
        'For resend otp, user not found in the database with id:',
        req.params.id,
      );
      return res.status(200).json({
        status: 'SUCCESS',
        message:
          'If user exists then mail with reset password link will be sent.',
      });
    } else {
      let data = await User.sendOTP(user);
      let mailObj = {
        toAddress: [user.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.sentOTP,
        },
        mailFor: 'forgotPassword',
      };
      await MailHelper.sendMail(mailObj);
      res.status(200).json({
        status: 'SUCCESS',
        message:
          'If user exists then mail with reset password link will be sent.',
        id: user._id,
      });
    }
  } catch (e) {
    Logger.log.error('Error in forget-password API call', e.message || e);
    res.status(500).json({
      status: 'ERROR',
      message: e.message,
    });
  }
});
module.exports = router;
