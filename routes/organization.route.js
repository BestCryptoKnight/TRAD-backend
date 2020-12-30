/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
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


/**
 * Get details of an Organization
 */
router.get('/:organizationId', async function (req, res) {
    Logger.log.info('In get organization details call');
    if (req.params.organizationId && mongoose.Types.ObjectId.isValid(req.params.organizationId)) {
        let organizationId = req.params.organizationId;
        try {
            let organizationData = await Organization.findOne({_id: organizationId})
                .populate({
                    path: 'originAdminId',
                    select: ['name', 'email', 'contactNumber'],
                });
            res.status(200).send(organizationData);
        } catch (e) {
            Logger.log.error('Error occurred.', e.message || e);
            res.status(500).send(e.message || 'Something went wrong, please try again later.');
        }
    } else {
        Logger.log.error('Organization id not found.');
        res.status(400).send({message: 'Organization id not found.'});
    }
});

/**
 * Get the List of Organization
 */
router.get('/', async function (req, res) {
    Logger.log.info('In list organization call');
    let queryFilter = {};
    if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
    let option = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 5,
    };
    option.populate = {
        path: 'originAdminId',
        select: ['name', 'email'],
    };
    option.sort = {createdAt: 'desc'};
    try {
        let organizationDetails = await Organization.paginate(queryFilter, option);
        res.status(200).send(organizationDetails);
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send(e.message || 'Something went wrong, please try again later.');
    }
});

/**
 * Creates an Organization, with a bot & an Admin
 */
router.post('/', async function (req, res) {
    Logger.log.info('In create organization call');
    if (
        !req.body.organization ||
        !req.body.organization.name ||
        !req.body.organization.email ||
        !req.body.organization.contactNumber ||
        !req.body.user ||
        !req.body.user.name ||
        !req.body.user.email ||
        !req.body.user.contactNumber
    ) {
        Logger.log.error('Required field is missing in create organization.');
        return res.status(400).send({message: 'Required field is missing.'});
    }
    let organization = req.body.organization;
    try {
        let organizationData = await Organization.create(organization);
        Logger.log.info('Organization created successfully.', organizationData);
        let userData = req.body.user;
        if (req.user && req.user._id) {
            userData.createdBy = req.user._id;
        }
        userData = await User.create(userData);
        Logger.log.info('User created successfully.');
        Logger.log.info('Dialogflow Object created successfully.');
        let newPromiseArr = [];
        let signUpToken = jwt.sign(JSON.stringify({_id: userData._id}), config.jwtSecret);
        organizationData.originAdminId = userData._id;
        await organizationData.save();
        userData.signUpToken = signUpToken;
        userData.organizationId = organizationData._id;
        await userData.save();
        let mailObj = {
            toAddress: [organization.adminEmail],
            subject: 'Welcome to TRAD',
            text: {
                name: organization.adminName ? organization.adminName : '',
                setPasswordLink:
                    config.server.frontendUrls.adminPanelBase +
                    config.server.frontendUrls.setPasswordPage +
                    userData._id +
                    '?token=' +
                    signUpToken,
            },
            mailFor: 'newUser',
        };
        await newPromiseArr.push(MailHelper.sendMail(mailObj));
        Logger.log.info('Organization updated, binded originAdminId');
        res.status(200).send({message: 'Organization created successfully.'});

    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send(e.message || 'Something went wrong, please try again later.');
    }
});

/**
 * Updates an Organization
 */
router.put('/:organizationId', async function (req, res) {
    Logger.log.info('In update organization call');
    if (!req.params.organizationId || !mongoose.Types.ObjectId.isValid(req.params.organizationId)) {
        Logger.log.error('Organization id not found.');
        return res.status(400).send({message: 'Something went wrong, please try again.'});
    }
    let organizationId = req.params.organizationId;
    try {
        let organizationUpdateObj = req.body.organization;
        delete organizationUpdateObj['email'];
        if (req.body.organization) {
            await Organization.findByIdAndUpdate(
                organizationId,
                organizationUpdateObj,
                {new: true},
            );
        }
        if (req.body.originAdminId) {
            let updateObj = req.body.originAdminId;
            let userId = req.body.originAdminId._id;
            delete updateObj['_id'];
            delete updateObj['email'];
            await User.findByIdAndUpdate(
                userId,
                updateObj,
                {new: true},
            );
        }
        Logger.log.info('Organization updated successfully.');
        res.status(200).send({message: 'Organization updated successfully.'});
    } catch (e) {
        Logger.log.error('Error occurred.', e.message || e);
        res.status(500).send(e.message || 'Something went wrong, please try again later.');
    }
});

/**
 * Deletes an Organization
 */
router.delete('/:organizationId', async function (req, res) {
    Logger.log.info('In delete organization call');
    if (req.params.organizationId && mongoose.Types.ObjectId.isValid(req.params.organizationId)) {
        let organizationId = req.params.organizationId;
        try {
            let promiseArr = [];
            promiseArr.push(User.deleteMany({organizationId: organizationId}));
            promiseArr.push(Organization.deleteOne({_id: organizationId}));
            await Promise.all(promiseArr);
            Logger.log.info('Organization deleted successfully.');
            res.status(200).send({message: 'Organization deleted successfully.'});
        } catch (e) {
            Logger.log.error('Error occurred.', e.message || e);
            res.status(500).send(e.message || 'Something went wrong, please try again later.');
        }
    } else {
        Logger.log.error('Organization id not found.');
        res.status(400).send({message: 'Something went wrong, please try again.'});
    }
});

/**
 * Export Router
 */
module.exports = router;
