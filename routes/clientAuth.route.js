/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const ClientUser = mongoose.model('client-user');

/*
* Local Imports
* */
const authenticate = require('./../middlewares/authenticate').clientAuthMiddleWare;
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
        let clientUser = await ClientUser.findByCredentials(userId, password);
        if (clientUser) {
            let token = clientUser.getAuthToken();
            clientUser.jwtToken.push(token);
            clientUser.profilePicture = getProfileUrl(clientUser.profilePicture);
            await clientUser.save();
            res.status(200).send({
                status: 'SUCCESS',
                data: {
                    email: clientUser.email,
                    profilePicture: clientUser.profilePicture,
                    _id: clientUser._id,
                    token: token,
                }
            })
        } else {
            res.status(400).send({
                status: 'ERROR',
                message: 'Incorrect email or password.',
            })
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Change Password
 */
router.put('/change-password', authenticate, async (req, res) => {
    if (!req.body.oldPassword) {
        Logger.log.error('Old or new password not present');
        return res.status(400).send({
            status: 'ERROR',
            message: 'Old password not present',
        });
    }
    if (!req.body.newPassword) {
        Logger.log.error('New password not present');
        return res.status(400).send({
            status: 'ERROR',
            message: 'New password not present',
        });
    }
    try {
        let oldPassword = req.body.oldPassword;
        let newPassword = req.body.newPassword;
        let clientUser = req.user;
        let isMatch = await clientUser.comparePassword(oldPassword);
        if (isMatch) {
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
                message: 'Wrong password.',
            });
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Forget Password
 */
router.post('/forget-password', async (req, res) => {
    Logger.log.info('In forget password function call');
    if (!req.body.email) {
        res.status(400).send({status: 'ERROR', message: 'Email not found'});
        return;
    }
    try {
        let user = await ClientUser.findOne({email: req.body.email, isDeleted: false});
        if (!user) {
            Logger.log.warn('For forget password, user not found in the database with the email:', req.body.email);
            return res.status(200).send({
                status: 'SUCCESS',
                message: 'If user exists then mail with reset password link will be sent.',
            });
        } else {
            let data = await ClientUser.generateOtp(user);
            let mailObj = {
                toAddress: [req.body.email],
                subject: 'Reset Password OTP',
                text: {
                    name: user.name ? user.name : '',
                    otp: data.verificationOtp
                },
                mailFor: 'forgotPassword',
            };
            await MailHelper.sendMail(mailObj);
            res.status(200).send({
                status: "SUCCESS",
                message: 'If user exists then mail with verification OTP will be sent.',
                id: user._id
            });
        }
    } catch (e) {
        Logger.log.error('error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Verify OTP
 */
router.post('/verify-otp', async (req, res) => {
    if (!req.body.verificationOtp || !mongoose.isValidObjectId(req.body._id)) {
        return res.status(400).send({
            status: 'ERROR',
            message: 'Something went wrong, please try the process from beginning.',
        });
    }
    try {
        let clientUser = await ClientUser.findById(mongoose.Types.ObjectId(req.body._id));
        if (!clientUser) {
            return res.status(400).send({
                status: 'ERROR',
                message: 'No user found'
            })
        }
        let verificationOtp = req.body.verificationOtp;
        if (!clientUser.otpExpireTime || clientUser.otpExpireTime.getTime() < new Date().getTime()) {
            return res.status(400).send({
                status: 'ERROR',
                message: 'otp expired'
            })
        } else if (!clientUser.verificationOtp || clientUser.verificationOtp.toString() !== verificationOtp.toString()) {
            return res.status(400).send({
                status: 'ERROR',
                message: 'Wrong otp'
            });
        }
        await ClientUser.removeOtp(clientUser);
        let token = jwt.sign(JSON.stringify({
            _id: clientUser._id,
            expiredTime: 5 * 60 * 1000 + Date.now()
        }), config.jwt.secret);
        res.status(200).send({
            status: 'SUCCESS',
            id: clientUser._id,
            token: token
        });
    } catch (e) {
        Logger.log.error('Error in verify-otp API call', e.message || e);
        res.status(500).send({
            status: 'ERROR',
            message: e.message
        });
    }
});

/**
 * Reset Password
 */
router.post('/:id/reset-password', async (req, res) => {
    jwt.verify(req.body.token, config.jwt.secret, async (err, decoded) => {
        if (err) {
            Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
            return res.status(401).send({status: 'ERROR', message: 'Authentication failed. Error in decoding token.'});
        } else {
            if (decoded.expiredTime < Date.now()) {
                res.status(401).send({
                    status: 'ERROR',
                    message: 'The link to reset password has expired, please repeat the process by clicking on Forget Password from login page.'
                });
                Logger.log.info('AUTH - token expired. user id:' + decoded._id);
            } else if (decoded._id !== req.params.id) {
                Logger.log.warn('AUTH - Invalid id:' + req.params.id);
                return res.status(401).send({
                    status: 'ERROR',
                    message: 'Invalid request, please repeat process from beginning.'
                });
            } else {
                try {
                    let clientUser = await ClientUser.findById(decoded._id);
                    if (!clientUser) {
                        return res.status(400).send({status: 'ERROR', message: 'No user for the given mail id found'});
                    } else {
                        clientUser.password = req.body.password;
                        clientUser.jwtToken = [];
                        await clientUser.save();
                        Logger.log.info('User password updated id:' + clientUser._id);
                        res.status(200).send({status: 'SUCCESS', message: 'Password changed successfully'});
                    }
                } catch (e) {
                    Logger.log.error('error occurred.', e.message || e);
                    res.status(500).send({
                        status: 'ERROR',
                        message: e.message || 'Something went wrong, please try again later.'
                    });
                }
            }
        }
    });
});

/**
 * Set Password (Initially & One time)
 */
router.post('/:id/set-password', async (req, res) => {
    jwt.verify(req.body.signUpToken, config.jwt.secret, async (err, decoded) => {
        if (err) {
            Logger.log.warn('JWT - Authentication failed. Error in decoding token.');
            return res.status(401).send({status: 'ERROR', message: 'Authentication failed. Error in decoding token.'});
        } else {
            if (decoded._id.toString() !== req.params.id.toString()) {
                Logger.log.warn('AUTH - Invalid id:' + req.params.id);
                return res.status(401).send({
                    status: 'ERROR',
                    message: 'Invalid request, please repeat process from beginning.'
                });
            } else {
                try {
                    let clientUser = await ClientUser.findById(decoded._id);
                    if (!clientUser) {
                        return res.status(400).send({status: 'ERROR', message: 'No user for the given mail id found'});
                    } else if (!clientUser.signUpToken) {
                        Logger.log.warn('Link to generate password has already been used for user id:' + req.params.id);
                        return res.status(400).send({
                            status: 'ERROR',
                            message: 'Password has already once set, to recover password, click on Forgot Password from Login Page.'
                        });
                    } else if (!clientUser.signUpToken || clientUser.signUpToken !== req.body.signUpToken) {
                        Logger.log.warn(
                            'AUTH - Invalid signUp token or signUpToken not present in DB for user id:' +
                            req.params.id,
                        );
                        return res.status(401).send({
                            status: 'ERROR',
                            message: 'Invalid request, please repeat process from beginning.'
                        });
                    } else {
                        clientUser.password = req.body.password;
                        clientUser.signUpToken = null;
                        await clientUser.save();
                        Logger.log.info('User password set id:' + clientUser._id);
                        res.status(200).send({status: 'SUCCESS', message: 'Password set successfully'});
                    }
                } catch (e) {
                    Logger.log.error('error occurred.', e.message || e);
                    res.status(500).send({
                        status: 'ERROR',
                        message: e.message || 'Something went wrong, please try again later.'
                    });
                }
            }
        }
    });
});

/**
 * Call for Logout
 */
router.delete('/logout', authenticate, async (req, res) => {
    try {
        await req.user.removeToken(req.headers.authorization);
        res.status(200).send({
            status: 'SUCCESS',
            message: 'User logout successfully',
        });
    } catch (e) {
        Logger.log.error('Error in logout API call ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
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
        if (imageName.indexOf(config.server.backendServerUrl + getProfileImagePath()) !== -1) return imageName;
        else return config.server.backendServerUrl + getProfileImagePath() + imageName;
    return '';
}

/**
 * Export Router
 */
module.exports = router;