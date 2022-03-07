/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const authenticate = require('./../middlewares/authenticate').authMiddleWare;
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
    let user = await User.findByCredentials(userId, password);
    if (user) {
      let token = user.getAuthToken();
      user.jwtToken.push({ token: token, lastAPICallTime: new Date() });
      user.profilePicture = getProfileUrl(user.profilePicture);
      await user.save();
      res.status(200).send({
        status: 'SUCCESS',
        data: {
          name: user.name,
          email: user.email,
          contactNumber: user.contactNumber,
          organizationId: user.organizationId,
          profilePicture: user.profilePicture,
          _id: user._id,
          role: user.role,
          token: token,
        },
      });
    }
  } catch (e) {
    if (e.status === 'USER_NOT_FOUND') {
      res.status(400).send({
        status: 'ERROR',
        messageCode: 'INCORRECT_EMAIL_OR_PASSWORD',
        message: 'Incorrect email or password',
      });
    } else {
      Logger.log.error('Error in login API call', e.message || e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later',
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
    let user = await User.findOne({ _id: req.user._id });
    let isMatch = await user.comparePassword(oldPassword, user.password);
    if (isMatch) {
      const isLastUsedPassword = await user.comparePassword(
        newPassword,
        user.password,
      );
      if (isLastUsedPassword) {
        return res.status(400).send({
          status: 'BAD_REQUEST',
          messageCode: 'SAME_OLD_PASSWORD',
          message: "User can't set last used password",
        });
      }
      user.password = newPassword;
      user.jwtToken = [];
      await user.save();
      Logger.log.info('Password changed successfully');
      res.status(200).send({
        status: 'SUCCESS',
        message: 'Password changed successfully',
      });
    } else {
      res.status(400).send({
        status: 'ERROR',
        messageCode: 'WRONG_CURRENT_PASSWORD',
        message: 'Wrong current password',
      });
    }
  } catch (e) {
    Logger.log.error('Error in change-password API call', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
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
    let user = await User.findOne({
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
      if (user.signUpToken) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'PENDING_USER_ACTIVATION_PROCESS',
          message: 'Please complete your activation process or contact admin',
        });
      }
      let data = await User.generateOtp(user);
      let mailObj = {
        toAddress: [req.body.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.verificationOtp,
          expireTime: 5,
        },
        mailFor: 'adminForgotPassword',
      };
      await MailHelper.sendMail(mailObj);
      res.status(200).send({
        status: 'SUCCESS',
        message: 'If user exists then mail with verification OTP will be sent',
      });
    }
    // let user = await User.findOne({email: req.body.email});
    // if (!user) {
    //     Logger.log.warn('For forget password, user not found in the database with the email:', req.body.email);
    //     res.status(200).send({
    //         message: 'If user exists then mail with reset password link will be sent.',
    //     });
    // } else {
    //     let token = jwt.sign(JSON.stringify({_id: user._id, timeStamp: Date.now()}), config.jwt.secret);
    //     let mailObj = {
    //         toAddress: [req.body.email],
    //         subject: 'Reset Password Link',
    //         text: {
    //             name: user.name ? user.name : '',
    //         },
    //         mailFor: 'forgotPassword',
    //     };
    //     mailObj.text.resetPasswordLink =
    //         config.server.frontendUrls.adminPanelBase +
    //         config.server.frontendUrls.resetPasswordPage +
    //         user._id +
    //         '?token=' +
    //         token;
    //     mailObj.text.forgotPasswordLink =
    //         config.server.frontendUrls.adminPanelBase + config.server.frontendUrls.forgotPasswordPage;
    //     await MailHelper.sendMail(mailObj);
    //     Logger.log.info('Reset Password link:', 'reset/' + user._id + '?token=' + token);
    //     res.status(200).send({
    //         message: 'If user exists then mail with reset password link will be sent.',
    //     });
    // }
  } catch (e) {
    Logger.log.error('Error in forget-password API call', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
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
    let user = await User.findOne({
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
      let data = await User.generateOtp(user);
      let mailObj = {
        toAddress: [req.body.email],
        subject: 'Reset Password OTP',
        text: {
          name: user.name ? user.name : '',
          otp: data.verificationOtp,
          expireTime: 5,
        },
        mailFor: 'adminForgotPassword',
      };
      await MailHelper.sendMail(mailObj);
      res.status(200).send({
        status: 'SUCCESS',
        message: 'If user exists then mail with verification OTP will be sent',
      });
    }
  } catch (e) {
    Logger.log.error('Error in resend-otp API call', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
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
      message: 'Require fields are missing',
    });
  }
  try {
    let user = await User.findOne({
      email: {
        $regex: new RegExp('^' + req.body.email.toLowerCase() + '$', 'i'),
      },
      isDeleted: false,
    });
    if (!user) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }
    let verificationOtp = req.body.verificationOtp;
    if (
      !user.otpExpireTime ||
      user.otpExpireTime.getTime() < new Date().getTime()
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'OTP_EXPIRED',
        message: 'OTP expired',
      });
    } else if (
      !user.verificationOtp ||
      user.verificationOtp.toString() !== verificationOtp.toString()
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'WRONG_OTP',
        message: 'Wrong otp',
      });
    }
    await User.removeOtp(user);
    let token = jwt.sign(
      JSON.stringify({
        _id: user._id,
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
        message: 'Authentication failed. Error in decoding token',
      });
    } else {
      if (decoded.expiredTime < Date.now()) {
        res.status(401).send({
          status: 'ERROR',
          messageCode: 'LINK_EXPIRED',
          message:
            'The link to reset password has expired, please repeat the process by clicking on Forget Password from login page',
        });
        Logger.log.info('AUTH - token expired. user id:' + decoded._id);
      } else {
        try {
          let user = await User.findById(decoded._id);
          if (!user) {
            return res.status(400).send({
              status: 'ERROR',
              messageCode: 'USER_NOT_FOUND',
              message: 'No user for the given mail id found',
            });
          } else {
            const isLastUsedPassword = await user.comparePassword(
              req.body.password,
              user.password,
            );
            if (isLastUsedPassword) {
              return res.status(400).send({
                status: 'BAD_REQUEST',
                messageCode: 'SAME_OLD_PASSWORD',
                message: "User can't set last used password",
              });
            }
            user.password = req.body.password;
            user.jwtToken = [];
            await user.save();
            Logger.log.info('User password updated id:' + user._id);
            res.status(200).send({
              status: 'SUCCESS',
              message: 'Password changed successfully',
            });
          }
        } catch (e) {
          Logger.log.error(
            'Error occurred in reset-password API Call',
            e.message || e,
          );
          res.status(500).send({
            status: 'ERROR',
            message:
              e.message || 'Something went wrong, please try again later',
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
        let user = await User.findById(decoded._id);
        if (!user) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'USER_NOT_FOUND',
            message: 'No user for the given mail id found',
          });
        } else if (!user.signUpToken) {
          Logger.log.warn(
            'Link to generate password has already been used for user id:' +
              decoded._id,
          );
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'PASSWORD_ALREADY_SET',
            message:
              'Password has already once set, to recover password, click on Forgot Password from Login Page',
          });
        } else if (
          !user.signUpToken ||
          user.signUpToken !== req.body.signUpToken
        ) {
          Logger.log.warn(
            'AUTH - Invalid signUp token or signUpToken not present in DB for user id:' +
              decoded._id,
          );
          return res.status(401).send({
            status: 'ERROR',
            messageCode: 'UNAUTHORIZED',
            message: 'Invalid request, please repeat process from beginning',
          });
        } else if (decoded.expiredTime < Date.now()) {
          Logger.log.info('Set password link expired. user id:' + decoded._id);
          return res.status(401).send({
            status: 'ERROR',
            messageCode: 'LINK_EXPIRED',
            message:
              'The link to set password has expired, please contact admin for that',
          });
        } else {
          user.password = req.body.password;
          user.signUpToken = null;
          await user.save();
          Logger.log.info('User password set id:' + user._id);
          res.status(200).send({
            status: 'SUCCESS',
            message: 'Password set successfully',
          });
        }
      } catch (e) {
        Logger.log.error(
          'Error occurred in set-password API Call.',
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
    await User.updateOne(
      { _id: decoded._id },
      { $pull: { jwtToken: { token: token } } },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'User logout successfully',
    });
  } catch (e) {
    Logger.log.error('Error in logout API call ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
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
