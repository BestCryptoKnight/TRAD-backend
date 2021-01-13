/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('./../services/logger');
const MailHelper = require('./../helper/mailer.helper');
const RssHelper = require('./../helper/rss.helper');

/**
 * List Client User details
 */
router.get('/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let queryFilter = {
            isDeleted: false,
            clientId: req.params.clientId
        };
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.sort = {createdAt: 'desc'};
        option.lean = true;
        let clientUsers = await ClientUser.paginate(queryFilter, option);
        res.status(200).send({status: 'SUCCESS', data: clientUsers});
    } catch (e) {
        Logger.log.error('Error occurred in listing clients.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Client User details
 */
router.get('/details/:clientUserId', async function (req, res) {
    try {
        if (!req.params.clientUserId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let clientUser = await ClientUser.findOne({_id: req.params.clientUserId});
        res.status(200).send({status: 'SUCCESS', data: clientUser});
    } catch (e) {
        Logger.log.error('Error occurred in listing clients.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});


/**
 * Updates a User
 */
// router.put('/:userId/', async function (req, res) {
//     Logger.log.info('In user update call');
//     if (!req.params.userId || !mongoose.Types.ObjectId.isValid(req.params.userId)) {
//         Logger.log.error('User id not found in request query params.');
//         return res.status(400).send({message: 'Something went wrong, please try again.'});
//     }
//     let userId = req.params.userId;
//     try {
//         let updateObj = {};
//         if (req.body.name) updateObj.name = req.body.name;
//         if (req.body.contactNumber) updateObj.contactNumber = req.body.contactNumber;
//         if (req.body.role) updateObj.role = req.body.role;
//         if (req.body.moduleAccess) updateObj.moduleAccess = req.body.moduleAccess;
//         await User.updateOne({_id: userId}, updateObj, {new: true});
//         Logger.log.info('User Updated successfully.');
//         res.status(200).send({message: 'User updated successfully.'});
//     } catch (e) {
//         Logger.log.error('Error occurred.', e.message || e);
//         res.status(500).send(e.message || 'Something went wrong, please try again later.');
//     }
// });

/**
 * Export Router
 */
module.exports = router;
