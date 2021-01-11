/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
* Local Imports
* */
const config = require('../config');
const Logger = require('./../services/logger');
const RssHelper = require('./../helper/rss.helper');

/**
 * Search Client from RSS
 */
router.get('/search-from-crm', async function (req, res) {
    try {
        if (!req.query.searchKeyword) {
            Logger.log.error('No text passed to perform search.');
            return res.status(400).send({status: 'ERROR', message: 'Pass some text to perform search.'});
        }
        let searchKeyword = req.query.searchKeyword;
        let clients = await RssHelper.getClients({searchKeyword});
        let responseArr = clients.map(({name, id}) => ({name, id}));
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
        let clientDataFromCrm = await RssHelper.getClientById({clientId: req.params.crmId});
        let client = new Client(clientDataFromCrm);
        let contactsFromCrm = await RssHelper.getClientContacts({clientId: req.params.crmId});
        let promiseArr = [];
        contactsFromCrm.forEach(crmContact => {
            let contact = new ClientUser(crmContact);
            contact.clientId = client._id;
            promiseArr.push(contact.save());
            //TODO Send INVITATION Mail to all the USERS
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
