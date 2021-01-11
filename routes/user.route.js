/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const User = mongoose.model('user');

/*
* Local Imports
* */
const config = require('../config');
const MailHelper = require('./../helper/mailer.helper');
const Logger = require('./../services/logger');

const uploadProfilePath = path.resolve(__dirname, '../upload/' + getProfileImagePath());
// Custom Multer storage engine
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadProfilePath);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + '-' + file.originalname);
    },
});
const upload = multer({dest: uploadProfilePath, storage: storage});

/**
 * Upload for profile-picture of User.
 */
router.post('/upload/profile-picture', upload.single('profile-picture'), async (req, res) => {
    let userId = req.user._id;
    if (!userId) {
        Logger.log.error('User id not found in the logged in user');
        return res.status(400).send({
            status: 'ERROR',
            message: 'User not found, please try by logging in again.',
        });
    }
    try {
        await User.findByIdAndUpdate(userId, {profilePicture: req.file.filename}, {new: true})
        res.status(200).send({status: 'success', data: getProfileUrl(getProfileUrl(req.file.filename))});
        if (req.query.oldImageName) {
            Logger.log.info('Old image name:', req.query.oldImageName);
            let imagePath = path.resolve(__dirname + '/../upload/' + getProfileImagePath() + req.query.oldImageName);
            fs.unlink(imagePath, (err) => {
                if (err) {
                    Logger.log.warn(
                        `Error deleting profile picture with name: ${req.query.oldImageName} by user ${req.user._id}`,
                    );
                    Logger.log.warn(err.message || err);
                } else Logger.log.info('Successfully deleted old profile picture.');
            });
        }
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Remove profile-picture of User.
 */
router.delete('/profile-picture', async (req, res) => {
    let userId = req.user._id;
    if (!userId) {
        Logger.log.error('User id not found in the logged in user');
        return res.status(400).send({
            status: 'ERROR',
            message: 'User not found, please try by logging in again.',
        });
    }
    if (!req.query.oldImageName) {
        Logger.log.error('In delete profile picture call, old image name not present for the user:', userId);
        return res.status(400).send({
            status: 'ERROR',
            message: 'Image name not found, unable to remove old profile picture.',
        });
    }
    Logger.log.info('Old image name:', req.query.oldImageName);
    let imagePath = path.resolve(__dirname + '/../upload/' + getProfileImagePath() + req.query.oldImageName);
    fs.unlink(imagePath, async (err) => {
        if (err) {
            Logger.log.warn(
                `Error deleting profile picture with name: ${req.query.oldImageName} by user ${req.user._id}`,
            );
            Logger.log.warn(err.message || err);
            return res.status(500).send({status: 'ERROR', message: 'Error removing profile picture.'});
        } else {
            Logger.log.info('Successfully deleted old profile picture.');
            await User.findByIdAndUpdate(userId, {profilePicture: null}, {new: true})
            res.status(200).send({status: 'SUCCESS', message: 'Profile Picture deleted successfully.'});
        }
    });
});

/**
 * Gets the Profile
 */
router.get('/profile', async function (req, res) {
    Logger.log.info('In get profile call');
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', message: 'Please first login to update the profile.'});
    }
    try {
        let userData = await User.findById(req.user._id)
            .select({name: 1, role: 1, email: 1, contactNumber: 1, profilePicture: 1});
        userData.profilePicture = getProfileUrl(userData.profilePicture);
        Logger.log.info('Fetched user details');
        res.status(200).send({status: 'SUCCESS', data: userData});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get details of a user
 */
router.get('/:userId', async function (req, res) {
    Logger.log.info('In get user details call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found in query params.');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    let userId = req.params.userId;
    try {
        let userData = await User.findById(userId)
            .select({name: 1, email: 1, contactNumber: 1, role: 1});
        Logger.log.info('Fetched details of user successfully.');
        res.status(200).send({status: 'SUCCESS', data: userData});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get the List of User
 */
router.get('/', async function (req, res) {
    Logger.log.info('In list user call');
    try {
        let queryFilter = {
            isDeleted: false
        };
        if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.select = {name: 1, email: 1, role: 1, createdAt: 1, contactNumber: 1, signUpToken: 1, moduleAccess: 1};
        option.sort = {createdAt: 'desc'};
        option.lean = true;
        let responseObj = await User.paginate(queryFilter, option);
        if (responseObj && responseObj.docs && responseObj.docs.length !== 0) {
            responseObj.docs.forEach(user => {
                if (!user.signUpToken)
                    user.status = 'active';
                else
                    user.status = 'pending';
                delete user.signUpToken;
            })
        }
        res.status(200).send({status: 'SUCCESS', data: responseObj});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Creates User
 */
router.post('/', async function (req, res) {
    Logger.log.info('In create user call');
    if (!req.user || !req.user._id) {
        Logger.log.error('You must login first to create a new user.');
        return res.status(401).send({status: 'ERROR', message: 'You must login first to create a new user.'});
    }
    if (!req.body.email) {
        Logger.log.error('Email not present for new user');
        return res.status(400).send({status: 'ERROR', message: 'Please enter email for new user.'});
    }
    try {
        // TODO add basic/default modules for the right
        let objToSave = req.body;
        objToSave.createdBy = req.user._id;
        objToSave.organizationId = req.user.organizationId;
        let user = new User(objToSave);
        Logger.log.info('New user created successfully.');
        let signUpToken = jwt.sign(JSON.stringify({_id: user._id}), config.jwt.secret);
        user.signUpToken = signUpToken;
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
            mailFor: 'newUser',
        };
        Logger.log.info('User created successfully.');
        res.status(200).send({status: 'SUCCESS', message: 'User created successfully.'});
        await MailHelper.sendMail(mailObj);
        Logger.log.info('Mail sent to new user successfully.');
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Updates User - Profile
 */
router.put('/profile', async function (req, res) {
    Logger.log.info('In user update profile call');
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', message: 'Please first login to update the profile.'});
    }
    let updateObj = {};
    if (req.body.name) updateObj.name = req.body.name;
    if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
    try {
        await User.findByIdAndUpdate(req.user._id, updateObj, {new: true});
        Logger.log.info('Updated user profile.');
        res.status(200).send({status: 'SUCCESS', message: 'User profile updated successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Updates a User
 */
router.put('/:userId/', async function (req, res) {
    Logger.log.info('In user update call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found in request query params.');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    let userId = req.params.userId;
    try {
        let updateObj = {};
        if (req.body.name) updateObj.name = req.body.name;
        if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
        if (req.body.role) updateObj.role = req.body.role;
        if (req.body.moduleAccess) updateObj.moduleAccess = req.body.moduleAccess;
        await User.updateOne({_id: userId}, updateObj, {new: true});
        Logger.log.info('User Updated successfully.');
        res.status(200).send({status: 'SUCCESS', message: 'User updated successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Deletes a user
 */
router.delete('/:userId', async function (req, res) {
    Logger.log.info('In delete user call');
    if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
        Logger.log.error('User id not found.');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    try {
        let userId = req.params.userId;
        await User.updateOne({_id: userId}, {isDeleted: true});
        res.status(200).send({status: 'SUCCESS', message: 'User deleted successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
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
