/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
var User = mongoose.model('user');

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
    let userId = req.body.userId;
    let password = req.body.password;
    try {
        let user = await User.findByCredentials(userId, password);
        if (user) {
            let token = user.getAuthToken();
            user.profilePicture = getProfileUrl(user.profilePicture);
            res.send({
                name: user.name,
                email: user.email,
                contactNumber: user.contactNumber,
                organizationId: user.organizationId,
                profilePicture: user.profilePicture,
                _id: user._id,
                role: user.role,
                token: token,
            });
        } else {
            res.send({
                status: 'USER_NOT_FOUND',
                message: 'Incorrect email or password.',
            });
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Change Password
 */
router.put('/change-password', authenticate, async (req, res) => {
    if (!req.body.oldPassword) {
        Logger.log.error('Old or new password not present');
        return res.status(400).send({
            message: 'Old password not present',
        });
    }
    if (!req.body.newPassword) {
        Logger.log.error('New password not present');
        return res.status(400).send({
            message: 'New password not present',
        });
    }
    try {
        let oldPassword = req.body.oldPassword;
        let newPassword = req.body.newPassword;
        let user = req.user;
        let isMatch = await user.comparePassword(oldPassword);
        if (isMatch) {
            user.password = newPassword;
            await user.save();
            Logger.log.info('Password changed successfully');
            res.status(200).json({
                message: 'Password changed successfully',
            });
        } else {
            res.status(400).send({
                message: 'Wrong current password.',
            });
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Forget Password
 */
router.post('/forget-password', async (req, res) => {
    Logger.log.info('In forget password function call');
    if (!req.body.email) {
        res.status(400).send({message: 'Email not found'});
        return;
    }
    try {

        let user = await User.findOne({email: req.body.email});
        if (!user) {
            Logger.log.warn('For forget password, user not found in the database with the email:', req.body.email);
            res.status(200).send({
                message: 'If user exists then mail with reset password link will be sent.',
            });
        } else {
            let token = jwt.sign(JSON.stringify({_id: user._id, timeStamp: Date.now()}), config.jwtSecret);
            let mailObj = {
                toAddress: [req.body.email],
                subject: 'Reset Password Link',
                text: {
                    name: user.name ? user.name : '',
                },
                mailFor: 'forgotPassword',
            };
            mailObj.text.resetPasswordLink =
                config.server.frontendUrls.adminPanelBase +
                config.server.frontendUrls.resetPasswordPage +
                user._id +
                '?token=' +
                token;
            mailObj.text.forgotPasswordLink =
                config.server.frontendUrls.adminPanelBase + config.server.frontendUrls.forgotPasswordPage;
            await MailHelper.sendMail(mailObj);
            Logger.log.info('Reset Password link:', 'reset/' + user._id + '?token=' + token);
            res.status(200).send({
                message: 'If user exists then mail with reset password link will be sent.',
            });
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({message: e.message || 'Something went wrong, please try again later.'});
    }

});

/**
 * Reset Password
 */
router.post('/:id/reset-password', async (req, res) => {
    jwt.verify(req.body.token, config.jwtSecret, async (err, decoded) => {
        if (err) {
            Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
            return res.status(401).send({message: 'Authentication failed. Error in decoding token.'});
        } else {
            let validTime = decoded.timeStamp + 30 * 60 * 1000;
            if (validTime < Date.now()) {
                res.status(401).send({
                    message:
                        'The link to reset password has expired, please repeat the process by clicking on Forget Password from login page.',
                });
                Logger.log.info('AUTH - token expired. user id:' + decoded._id);
            } else if (decoded._id !== req.params.id) {
                Logger.log.warn('AUTH - Invalid id:' + req.params.id);
                return res.status(401).send({message: 'Invalid request, please repeat process from beginning.'});
            } else {
                try {
                    let user = await User.findById(decoded._id);
                    if (!user) {
                        return res.status(400).send({message: 'No user for the given mail id found'});
                    } else {
                        user.password = req.body.password;
                        await user.save();
                        Logger.log.info('User password updated id:' + user._id);
                        res.status(200).send({message: 'Password changed successfully'});
                    }
                } catch (e) {
                    Logger.log.error('error occurred.', e.message || e);
                    res.status(500).send({message: e.message || 'Something went wrong, please try again later.'});
                }
            }
        }
    });
});

/**
 * Set Password (Initially & One time)
 */
router.post('/:id/set-password', async (req, res) => {
    jwt.verify(req.body.signUpToken, config.jwtSecret, async (err, decoded) => {
        if (err) {
            Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
            return res.status(401).send({message: 'Authentication failed. Error in decoding token.'});
        } else {
            if (decoded._id.toString() !== req.params.id.toString()) {
                Logger.log.warn('AUTH - Invalid id:' + req.params.id);
                return res.status(401).send({message: 'Invalid request, please repeat process from beginning.'});
            } else {
                try {
                    let user = await User.findById(decoded._id);
                    if (!user) {
                        return res.status(400).send({message: 'No user for the given mail id found'});
                    } else if (!user.signUpToken) {
                        Logger.log.warn(
                            'Link to generate password has already been used for user id:' + req.params.id,
                        );
                        return res.status(400).send({
                            message:
                                'Password has already once set, to recover password, click on Forgot Password from Login Page.',
                        });
                    } else if (!user.signUpToken || user.signUpToken !== req.body.signUpToken) {
                        Logger.log.warn(
                            'AUTH - Invalid signUp token or signUpToken not present in DB for user id:' +
                            req.params.id,
                        );
                        return res
                            .status(401)
                            .send({message: 'Invalid request, please repeat process from beginning.'});
                    } else {
                        user.password = req.body.password;
                        user.signUpToken = null;
                        await user.save();
                        Logger.log.info('User password set id:' + user._id);
                        res.status(200).send({message: 'Password set successfully'});
                    }
                } catch (e) {
                    Logger.log.error('error occurred.', e.message || e);
                    res.status(500).send({message: e.message || 'Something went wrong, please try again later.'});
                }
            }
        }
    });
});

/**
 * Helper Functions
 */
function getProfileImagePath() {
    return config.uploadLocations.user.base + config.uploadLocations.user.profile;
}

function getProfileUrl(imageName) {
    if (imageName)
        if (imageName.indexOf(config.server.backendServerUrl + getProfileImagePath()) !== -1) return imageName;
        else return config.server.backendServerUrl + getProfileImagePath() + imageName;
    return '';
}

/**
 * Export Router
 */
module.exports = router;
