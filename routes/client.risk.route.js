/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
let mongoose = require('mongoose');
let User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');
const AuditLog = mongoose.model('audit-log');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('./../services/logger');
const MailHelper = require('./../helper/mailer.helper');
const RssHelper = require('./../helper/rss.helper');
const StaticFile = require('./../static-files/moduleColumn');

//client
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
 * Get Column Names
 */
router.get('/user/column-name',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'client-user');
        const clientUserColumn = req.user.manageColumns.find(i => i.moduleName === 'client-user');
        let columnList = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(clientUserColumn.columns.includes(module.manageColumns[i])){
                columnList.push({name:module.manageColumns[i],isChecked:true});
            } else {
                columnList.push({name:module.manageColumns[i],isChecked:false});
            }
        }
        res.status(200).send({status: 'SUCCESS', data: columnList});
    } catch (e) {
        Logger.log.error('Error occurred in get client-user column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * List Client User details
 */
router.get('/user/:clientId', async function (req, res) {
    try {
        if (!req.params.clientId) {
            Logger.log.error('No clientId passed.');
            return res.status(400).send({status: 'ERROR', message: 'Please pass client\'s id.'});
        }
        const clientColumn = req.user.manageColumns.find(i => i.moduleName === 'client-user');
        let queryFilter = {
            isDeleted: false,
            clientId: req.params.clientId
        };
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.select = clientColumn.columns.toString().replace(/,/g,' ');
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
router.get('/user-details/:clientUserId', async function (req, res) {
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
 * Get Column Names
 */
router.get('/column-name',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'client');
        const clientColumn = req.user.manageColumns.find(i => i.moduleName === 'client');
        let columnList = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(clientColumn.columns.includes(module.manageColumns[i])){
                columnList.push({name:module.manageColumns[i],isChecked:true});
            } else {
                columnList.push({name:module.manageColumns[i],isChecked:false});
            }
        }
        res.status(200).send({status: 'SUCCESS', data: columnList});
    } catch (e) {
        Logger.log.error('Error occurred in get column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

//client
/**
 * List Clients
 */
router.get('/', async function (req, res) {
    try {
        const clientColumn = req.user.manageColumns.find(i => i.moduleName === 'client');
        let queryFilter = {
            isDeleted: false
        };
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.select = clientColumn.columns.toString().replace(/,/g,' ');
        option.sort = {createdAt: 'desc'};
        option.lean = true;
        let clients = await Client.paginate(queryFilter, option);
        res.status(200).send({status: 'SUCCESS', data: clients});
    } catch (e) {
        Logger.log.error('Error occurred in listing clients.', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

//client
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

//client
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
        await RssHelper.fetchInsurerDetails({underwriterName:clientDataFromCrm.underWriter,crmClientId:clientDataFromCrm.crmClientId,clientId:client._id});
        let contactsFromCrm = await RssHelper.getClientContacts({clientId: req.params.crmId});
        let promiseArr = [];
        contactsFromCrm.forEach(crmContact => {
            let clientUser = new ClientUser(crmContact);
            clientUser.clientId = client._id;
            let signUpToken = jwt.sign(JSON.stringify({_id: clientUser._id}), config.jwt.secret);
            clientUser.signUpToken = signUpToken;
            promiseArr.push(clientUser.save());
            const userName = (clientUser.firstName ? clientUser.firstName + ' ' : '') + (clientUser.lastName ? clientUser.lastName : '');
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

//client
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
 * Sync Client Users from RSS - Update
 */
router.put('/user/sync-from-crm/:clientId', async function (req, res) {
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
 * Update Column Names
 */
router.put('/user/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', message: 'Please first login to update the profile.'});
    }
    if ( !req.body.hasOwnProperty('isReset') || !req.body.columns || req.body.columns.length === 0) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'client-user');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'client-user'},{$set:{'manageColumns.$.columns':updateColumns}});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Client User
 */
router.put('/user/:clientUserId', async function (req, res) {
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
 * Update Column Names
 */
router.put('/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        Logger.log.error('User data not found in req');
        return res.status(401).send({status: 'ERROR', message: 'Please first login to update the profile.'});
    }
    if ( !req.body.hasOwnProperty('isReset') || !req.body.columns || req.body.columns.length === 0) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'client');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'client'},{'manageColumns.$.columns':updateColumns});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

//client
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

//client
/**
 * Delete Client
 */
router.delete('/:clientId', async function (req, res) {
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
