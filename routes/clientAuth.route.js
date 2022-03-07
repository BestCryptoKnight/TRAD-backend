/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const ClientUser = mongoose.model('client-user');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const authenticate = require('./../middlewares/authenticate')
  .clientAuthMiddleWare;
const Logger = require('./../services/logger');
const config = require('../config');
const MailHelper = require('./../helper/mailer.helper');

/**
 * Router Definitions
 */

/**
 * Call for Login
 */
router.post('/login', async function (req, res) {
  if (!req.body.userId) {
    Logger.log.warn('Email is not present');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'EMAIL_NOT_FOUND',
      message: 'Email is not present',
    });
  }
  if (!req.body.password) {
    Logger.log.warn('Password not present');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'PASSWORD_NOT_FOUND',
      message: 'Password not present',
    });
  }
  let userId = req.body.userId;
  let password = req.body.password;
  try {
    let clientUser = await ClientUser.findByCredentials(userId, password);
    if (clientUser) {
      let token = clientUser.getAuthToken();
      clientUser.jwtToken.push({ token: token, lastAPICallTime: new Date() });
      clientUser.profilePicture = getProfileUrl(clientUser.profilePicture);
      await clientUser.save();
      res.status(200).send({
        status: 'SUCCESS',
        data: {
          email: clientUser.email,
          profilePicture: clientUser.profilePicture,
          _id: clientUser._id,
          token: token,
        },
      });
    } else {
      res.status(400).send({
        status: 'ERROR',
        messageCode: 'INCORRECT_EMAIL_OR_PASSWORD',
        message: 'Incorrect email or password.',
      });
    }
  } catch (e) {
    if (e.status === 'USER_NOT_FOUND') {
      res.status(400).send({
        status: 'ERROR',
        messageCode: 'INCORRECT_EMAIL_OR_PASSWORD',
        message: 'Incorrect email or password.',
      });
    } else {
      Logger.log.error(
        'Error Occurred in Client Login API Call',
        e.message || e,
      );
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  }
});

/**
 * Change Password
 */
router.put('/change-password', authenticate, async (req, res) => {
  if (!req.body.oldPassword) {
    Logger.log.warn('Old or new password not present');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'OLD_PASSWORD_NOT_FOUND',
      message: 'Old password not present',
    });
  }
  if (!req.body.newPassword) {
    Logger.log.warn('New password not present');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'NEW_PASSWORD_NOT_FOUND',
      message: 'New password not present',
    });
  }
  try {
    let oldPassword = req.body.oldPassword;
    let newPassword = req.body.newPassword;
    let clientUser = await ClientUser.findOne({ _id: req.user._id });
    let isMatch = await clientUser.comparePassword(
      oldPassword,
      clientUser.password,
    );
    if (isMatch) {
      const isLastUsedPassword = await clientUser.comparePassword(
        newPassword,
        clientUser.password,
      );
      if (isLastUsedPassword) {
        return res.status(400).send({
          status: 'BAD_REQUEST',
          messageCode: 'SAME_OLD_PASSWORD',
          message: "User can't set last used password",
        });
      }
      clientUser.password = newPassword;
      await clientUser.save();
      Logger.log.info('Password changed successfully');
      res.status(200).send({
        status: 'SUCCESS',
        message: 'Password changed successfully',
      });
    } else {
      res.status(400).send({
        status: 'ERROR',
        messageCode: 'WRONG_CURRENT_PASSWORD',
        message: 'Wrong password.',
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error Occurred in Client Change Password API Call',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Forget Password
 */
router.post('/forget-password', async (req, res) => {
  if (!req.body.email) {
    res.status(400).send({
      status: 'ERROR',
      messageCode: 'EMAIL_NOT_FOUND',
      message: 'Email not found',
    });
    return;
  }
  try {
    let user = await ClientUser.findOne({
      email: {
        $regex: new RegExp('^' + req.body.email.toLowerCase() + '$', 'i'),
      },
      isDeleted: false,
    });
    if (!user) {
      Logger.log.warn(
        'For forget password, user not found in the database with the email:',
        req.body.email,
      );
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    } else {
      const client = await Client.findOne({
        _id: user.clientId,
      })
        .populate({
          path: 'riskAnalystId serviceManagerId',
          select: 'name email contactNumber',
        })
        .lean();
      let data = await ClientUser.generateOtp(user);
      let mailObj = {
        toAddress: [req.body.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.verificationOtp,
          expireTime: 5,
          riskAnalystName:
            client.riskAnalystId && client.riskAnalystId.name
              ? client.riskAnalystId.name
              : null,
          serviceManagerName:
            client.serviceManagerId && client.serviceManagerId.name
              ? client.serviceManagerId.name
              : null,
          riskAnalystNumber:
            client.riskAnalystId && client.riskAnalystId.contactNumber
              ? client.riskAnalystId.contactNumber
              : null,
          serviceManagerNumber:
            client.serviceManagerId && client.serviceManagerId.contactNumber
              ? client.serviceManagerId.contactNumber
              : null,
          riskAnalystEmail:
            client.riskAnalystId && client.riskAnalystId.email
              ? client.riskAnalystId.email
              : null,
          serviceManagerEmail:
            client.serviceManagerId && client.serviceManagerId.email
              ? client.serviceManagerId.email
              : null,
        },
        mailFor: 'clientForgotPassword',
      };
      Logger.log.info(mailObj);
      await MailHelper.sendMail(mailObj);
      res.status(200).send({
        status: 'SUCCESS',
        message: 'If user exists then mail with verification OTP will be sent.',
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error Occurred in Client Forget Password API Call',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Resent OTP
 */
router.post('/resend-otp', async (req, res) => {
  if (!req.body.email) {
    res.status(400).send({
      status: 'ERROR',
      messageCode: 'EMAIL_NOT_FOUND',
      message: 'Email not found',
    });
    return;
  }
  try {
    let user = await ClientUser.findOne({
      email: {
        $regex: new RegExp('^' + req.body.email.toLowerCase() + '$', 'i'),
      },
      isDeleted: false,
    });
    if (!user) {
      Logger.log.warn(
        'For forget password, user not found in the database with the email:',
        req.body.email,
      );
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    } else {
      let data = await ClientUser.generateOtp(user);
      let mailObj = {
        toAddress: [req.body.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.verificationOtp,
        },
        mailFor: 'forgotPassword',
      };
      await MailHelper.sendMail(mailObj);
      res.status(200).send({
        status: 'SUCCESS',
        message: 'If user exists then mail with verification OTP will be sent.',
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error Occurred in Client Resend OTP API Call',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Verify OTP
 */
router.post('/verify-otp', async (req, res) => {
  if (!req.body.verificationOtp || !req.body.email) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try the process from beginning.',
    });
  }
  try {
    let clientUser = await ClientUser.findOne({
      email: {
        $regex: new RegExp('^' + req.body.email.toLowerCase() + '$', 'i'),
      },
      isDeleted: false,
    });
    if (!clientUser) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'USER_NOT_FOUND',
        message: 'No user found',
      });
    }
    let verificationOtp = req.body.verificationOtp;
    if (
      !clientUser.otpExpireTime ||
      clientUser.otpExpireTime.getTime() < new Date().getTime()
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'OTP_EXPIRED',
        message: 'OTP expired',
      });
    } else if (
      !clientUser.verificationOtp ||
      clientUser.verificationOtp.toString() !== verificationOtp.toString()
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'WRONG_OTP',
        message: 'Wrong otp',
      });
    }
    await ClientUser.removeOtp(clientUser);
    let token = jwt.sign(
      JSON.stringify({
        _id: clientUser._id,
        expiredTime: 5 * 60 * 1000 + Date.now(),
      }),
      config.jwt.secret,
    );
    res.status(200).send({
      status: 'SUCCESS',
      token: token,
    });
  } catch (e) {
    Logger.log.error('Error in verify-otp API call', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message,
    });
  }
});

/**
 * Reset Password
 */
router.post('/reset-password', async (req, res) => {
  jwt.verify(req.body.token, config.jwt.secret, async (err, decoded) => {
    if (err) {
      Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
      return res.status(401).send({
        status: 'ERROR',
        messageCode: 'AUTHENTICATION_FAILED',
        message: 'Authentication failed. Error in decoding token.',
      });
    } else {
      if (decoded.expiredTime < Date.now()) {
        res.status(401).send({
          status: 'ERROR',
          messageCode: 'LINK_EXPIRED',
          message:
            'The link to reset password has expired, please repeat the process by clicking on Forget Password from login page.',
        });
        Logger.log.info('AUTH - token expired. user id:' + decoded._id);
      } else {
        try {
          let clientUser = await ClientUser.findById(decoded._id);
          if (!clientUser) {
            return res.status(400).send({
              status: 'ERROR',
              messageCode: 'USER_NOT_FOUND',
              message: 'No user for the given mail id found',
            });
          } else {
            const isLastUsedPassword = await clientUser.comparePassword(
              req.body.password,
              clientUser.password,
            );
            if (isLastUsedPassword) {
              return res.status(400).send({
                status: 'BAD_REQUEST',
                messageCode: 'SAME_OLD_PASSWORD',
                message: "User can't set last used password",
              });
            }
            clientUser.password = req.body.password;
            clientUser.jwtToken = [];
            await clientUser.save();
            Logger.log.info('User password updated id:' + clientUser._id);
            res.status(200).send({
              status: 'SUCCESS',
              message: 'Password changed successfully',
            });
          }
        } catch (e) {
          Logger.log.error(
            'Error Occurred in Client Reset Password API Call',
            e.message || e,
          );
          res.status(500).send({
            status: 'ERROR',
            message:
              e.message || 'Something went wrong, please try again later.',
          });
        }
      }
    }
  });
});

/**
 * Set Password (Initially & One time)
 */
router.post('/set-password', async (req, res) => {
  jwt.verify(req.body.signUpToken, config.jwt.secret, async (err, decoded) => {
    if (err) {
      Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
      return res.status(401).send({
        status: 'ERROR',
        messageCode: 'AUTHENTICATION_FAILED',
        message: 'Authentication failed. Error in decoding token',
      });
    } else {
      try {
        let clientUser = await ClientUser.findById(decoded._id);
        if (!clientUser) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'USER_NOT_FOUND',
            message: 'No user for the given mail id found',
          });
        } else if (!clientUser.signUpToken) {
          Logger.log.warn(
            'Link to generate password has already been used for user id:' +
              req.params.id,
          );
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'PASSWORD_ALREADY_SET',
            message:
              'Password has already once set, to recover password, click on Forgot Password from Login Page.',
          });
        } else if (
          !clientUser.signUpToken ||
          clientUser.signUpToken !== req.body.signUpToken
        ) {
          Logger.log.warn(
            'AUTH - Invalid signUp token or signUpToken not present in DB for user id:' +
              req.params.id,
          );
          return res.status(401).send({
            status: 'ERROR',
            messageCode: 'UNAUTHORIZED',
            message: 'Invalid request, please repeat process from beginning.',
          });
        } else {
          clientUser.password = req.body.password;
          clientUser.signUpToken = null;
          await clientUser.save();
          Logger.log.info('User password set id:' + clientUser._id);
          res.status(200).send({
            status: 'SUCCESS',
            message: 'Password set successfully',
          });
        }
      } catch (e) {
        Logger.log.error(
          'Error Occurred in Client Set Password API Call',
          e.message || e,
        );
        res.status(500).send({
          status: 'ERROR',
          message: e.message || 'Something went wrong, please try again later.',
        });
      }
    }
  });
});

/**
 * Call for Logout
 */
router.delete('/logout', async (req, res) => {
  try {
    const token = req.header('authorization');
    const jwtSecret = config.jwt.secret;
    const decoded = jwt.verify(token, jwtSecret);
    await ClientUser.updateOne(
      { _id: decoded._id },
      { $pull: { jwtToken: { token: token } } },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'User logout successfully',
    });
  } catch (e) {
    Logger.log.error('Error in Client logout API call ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Helper Functions
 */
function getProfileImagePath() {
  return config.uploadLocations.user.base + config.uploadLocations.user.profile;
}

function getProfileUrl(imageName) {
  if (imageName)
    if (
      imageName.indexOf(
        config.server.backendServerUrl + getProfileImagePath(),
      ) !== -1
    )
      return imageName;
    else
      return config.server.backendServerUrl + getProfileImagePath() + imageName;
  return '';
}

/**
 * Export Router
 */
module.exports = router;
