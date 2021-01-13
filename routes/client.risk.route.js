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
 * Search Client from RSS
 */
router.get('/search-from-crm', async function (req, res) {
    try {
        // if (!req.query.searchKeyword) {
        //     Logger.log.error('No text passed to perform search.');
        //     return res.status(400).send({status: 'ERROR', message: 'Pass some text to perform search.'});
        // }
        let searchKeyword = req.query.searchKeyword;
        let clients = await RssHelper.getClients({searchKeyword});
        let clientIds = clients.map(client => client.id);
        let dbClients = await Client.find({isDeleted: false, crmClientId: {$in: clientIds}}).select({crmClientId: 1});
        let responseArr = [];
        dbClients = dbClients.map(dbClient => dbClient.crmClientId);
        for (let i = 0; i < clients.length; i++) {
            if (dbClients.indexOf(clients[i].id.toString()) === -1) {
                responseArr.push({crmId: clients[i].id, name: clients[i].name});
            }
        }
        res.status(200).send({status: 'SUCCESS', data: responseArr});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Add Client from RSS
 */
router.post('/:crmId', async function (req, res) {
    try {
        if (!req.params.crmId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let client = await Client.findOne({isDeleted: false, crmClientId: req.params.crmId});
        if(client){
            Logger.log.error('Client already exists in the system', req.params.crmId);
            return res.status(400).send({status: 'ERROR', message: 'Client already exists in the system.'});
        }
        let clientDataFromCrm = await RssHelper.getClientById({clientId: req.params.crmId});
        client = new Client(clientDataFromCrm);
        let contactsFromCrm = await RssHelper.getClientContacts({clientId: req.params.crmId});
        let promiseArr = [];
        contactsFromCrm.forEach(crmContact => {
            let clientUser = new ClientUser(crmContact);
            clientUser.clientId = client._id;
            let signUpToken = jwt.sign(JSON.stringify({_id: clientUser._id}), config.jwt.secret);
            clientUser.signUpToken = signUpToken;
            promiseArr.push(clientUser.save());
            const userName = (clientUser.firstName ? clientUser.firstName + ' ' : '') + (clientUser.lastName ? clientUser.lastName : '')
            let mailObj = {
                toAddress: [clientUser.email],
                subject: 'Welcome to TRAD CLIENT PORTAL',
                text: {
                    name: userName,
                    setPasswordLink:
                        config.server.frontendUrls.clientPanelBase +
                        config.server.frontendUrls.setPasswordPage +
                        clientUser._id +
                        '?token=' +
                        signUpToken,
                },
                mailFor: 'newClientUser',
            };
            promiseArr.push(MailHelper.sendMail(mailObj));
        });
        promiseArr.push(client.save());
        await Promise.all(promiseArr);
        res.status(200).send({status: 'SUCCESS', data: client});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Sync Client from RSS - Update
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
        let clientDataFromCrm = await RssHelper.getClientById({clientId: client.crmClientId});
        await Client.updateOne({_id: req.params.clientId}, clientDataFromCrm);
        res.status(200).send({status: 'SUCCESS', message: 'Client synced successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Client
 */
router.put('/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        await Client.updateOne({_id: req.params.clientId}, req.body);
        res.status(200).send({status: 'SUCCESS', message: 'Client updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * List Clients
 */
router.get('/', async function (req, res) {
    try {
        let queryFilter = {
            isDeleted: false
        };
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.sort = {createdAt: 'desc'};
        option.lean = true;
        let clients = await Client.paginate(queryFilter, option);
        res.status(200).send({status: 'SUCCESS', data: clients});
    } catch (e) {
        Logger.log.error('Error occurred in listing clients.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Client
 */
router.get('/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let client = await Client.findOne({_id: req.params.clientId});
        res.status(200).send({status: 'SUCCESS', data: client});
    } catch (e) {
        Logger.log.error('Error occurred in listing clients.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Delete Client
 */
router.put('/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        let promiseArr = [];
        promiseArr.push(Client.updateOne({_id: req.params.clientId}, {isDeleted: true}));
        promiseArr.push(ClientUser.updateMany({clientId: req.params.clientId}, {isDeleted: true}));
        await Promise.all(promiseArr);
        res.status(200).send({status: 'SUCCESS', message: 'Client deleted successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in getting client list for search.', e.message || e);
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
