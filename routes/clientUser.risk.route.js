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
 * Sync Client Users from RSS - Update
 */
router.put('/sync-from-crm/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let client = await Client.findOne({_id: req.params.clientId});
        if(!client){
            Logger.log.error('No Client found', req.params.crmId);
            return res.status(400).send({status: 'ERROR', message: 'Client not found.'});
        }
        let contactsFromCrm = await RssHelper.getClientContacts({clientId: client.crmClientId});
        let promiseArr = [];
        contactsFromCrm.forEach(crmContact => {
            promiseArr.push(ClientUser.findOneAndUpdate({crmContactId: crmContact.crmContactId, isDeleted: false}, crmContact, {upsert: true}));
        });
        await Promise.all(promiseArr);
        res.status(200).send({status: 'SUCCESS', message: 'Client Contacts synced successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Client User
 */
router.put('/:clientUserId', async function (req, res) {
    try {
        if (!req.params.clientUserId) {
            Logger.log.error('No clientUserId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client user\'s id.'});
        }
        await ClientUser.updateOne({_id: req.params.clientUserId}, req.body);
        res.status(200).send({status: 'SUCCESS', message: 'Client User updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});


/**
 * Export Router
 */
module.exports = router;
