/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Insurer = mongoose.model('insurer');
const InsurerUser = mongoose.model('insurer-user');
const {getInsurerContacts} = require('./../helper/rss.helper');

/*
* Local Imports
* */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Column Names
 */
router.get('/column-name',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'insurer');
        const insurerColumn = req.user.manageColumns.find(i => i.moduleName === 'insurer');
        let customFields = [];
        let defaultFields = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(insurerColumn && insurerColumn.columns.includes(module.manageColumns[i].name)){
                if(module.defaultColumns.includes(module.manageColumns[i].name)){
                    defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
                } else {
                    customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
                }
            } else {
                if(module.defaultColumns.includes(module.manageColumns[i].name)){
                    defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
                } else {
                    customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
                }
            }
        }
        res.status(200).send({status: 'SUCCESS', data: {defaultFields,customFields}});
    } catch (e) {
        Logger.log.error('Error occurred in get insurer column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Insurer Contacts List
 */
router.get('/user',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'insurer-user');
        const insurerColumn = req.user.manageColumns.find(i => i.moduleName === 'insurer-user');
        let queryFilter = {
            isDeleted: false
        };
        let sortingOptions = {};
        if(req.query.sortBy && req.query.sortOrder){
            sortingOptions[req.query.sortBy] = req.query.sortOrder
        }
        if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.select = insurerColumn.columns.toString().replace(/,/g, ' ');
        option.sort = sortingOptions;
        option.lean = true;
        let responseObj = await InsurerUser.paginate(queryFilter, option);
        responseObj.headers = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(insurerColumn.columns.includes(module.manageColumns[i].name)){
                responseObj.headers.push(module.manageColumns[i])
            }
        }
        res.status(200).send({status: 'SUCCESS', data: responseObj});
    } catch (e) {
        Logger.log.error('Error occurred in get insurer contacts list ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Column Names
 */
router.get('/user/column-name',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'insurer-user');
        const insurerColumn = req.user.manageColumns.find(i => i.moduleName === 'insurer-user');
        let customFields = [];
        let defaultFields = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(insurerColumn && insurerColumn.columns.includes(module.manageColumns[i].name)){
                if(module.defaultColumns.includes(module.manageColumns[i].name)){
                    defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
                } else {
                    customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:true});
                }
            } else {
                if(module.defaultColumns.includes(module.manageColumns[i].name)){
                    defaultFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
                } else {
                    customFields.push({name:module.manageColumns[i].name,label:module.manageColumns[i].label,isChecked:false});
                }
            }
        }
        res.status(200).send({status: 'SUCCESS', data: {defaultFields,customFields}});
    } catch (e) {
        Logger.log.error('Error occurred in get insurer contacts columns ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Insurer List
 */
router.get('/',async function (req,res) {
    try {
        const module = StaticFile.modules.find(i => i.name === 'insurer');
        const insurerColumn = req.user.manageColumns.find(i => i.moduleName === 'insurer');
        let queryFilter = {
            isDeleted: false
        };
        let sortingOptions = {};
        if(req.query.sortBy && req.query.sortOrder){
            sortingOptions[req.query.sortBy] = req.query.sortOrder
        }
        if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
        let option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.select = insurerColumn.columns.toString().replace(/,/g, ' ') + ' address';
        option.sort = sortingOptions;
        option.lean = true;
        let responseObj = await Insurer.paginate(queryFilter, option);
        responseObj.headers = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(insurerColumn.columns.includes(module.manageColumns[i].name)){
                responseObj.headers.push(module.manageColumns[i])
            }
        }
        let address = {};
        if (responseObj && responseObj.docs && responseObj.docs.length !== 0) {
            responseObj.docs.forEach(user => {
                address = {};
                if(insurerColumn.columns.includes('address.fullAddress')) {
                    address.fullAddress = Object.values(user.address).toString().replace(/,,/g,',');
                }
                if(insurerColumn.columns.includes('address.addressLine')){
                    address.addressLine = user.address.addressLine;
                }
                if(insurerColumn.columns.includes('address.city')){
                    address.city = user.address.city;
                }
                if(insurerColumn.columns.includes('address.state')){
                    address.state = user.address.state;
                }
                if(insurerColumn.columns.includes('address.country')){
                    address.country = user.address.country;
                }
                if(insurerColumn.columns.includes('address.zipCode')){
                    address.zipCode = user.address.zipCode;
                }
                user.address = address;
                delete user._id;
            })
        }
        res.status(200).send({status: 'SUCCESS', data: responseObj});
    } catch (e) {
        Logger.log.error('Error occurred in get insurer list ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Insurer Details
 */
router.get('/:insurerId',async function (req,res) {
    if (!req.params.insurerId || !mongoose.Types.ObjectId.isValid(req.params.insurerId)) {
        Logger.log.error('Insurer id not found in params.');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING',message: 'Something went wrong, please try again.'});
    }
   try {
        const insurer = await Insurer.findOne({_id:req.params.insurerId}).lean();
       res.status(200).send({status: 'SUCCESS', data: insurer});
   } catch (e) {
       Logger.log.error('Error occurred in get insurer details ', e.message || e);
       res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
   }
});

/**
 * Update Insurer Contacts Column Name
 */
router.put('/user/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        return res.status(401).send({status: 'ERROR', message: 'Please first login to update columns.'});
    }
    if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'insurer-user');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'insurer-user'},{$set:{'manageColumns.$.columns':updateColumns}});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update insure contacts columns', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Column Names
 */
router.put('/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        return res.status(401).send({status: 'ERROR', messageCode:'UNAUTHORIZED', message: 'Please first login to update columns.'});
    }
    if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', messageCode:'REQUIRE_FIELD_MISSING', message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'insurer');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'insurer'},{$set:{'manageColumns.$.columns':updateColumns}});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Sync Client Users from RSS - Update
 */
router.put('/user/sync-from-crm/:insurerId', async function (req, res) {
    try {
        if (!req.params.insurerId) {
            Logger.log.error('Insurer id not found.');
            return res.status(400).send({status: 'ERROR',  messageCode:'REQUIRE_FIELD_MISSING', message: 'Please pass insurer id.'});
        }
        const insurer = await Insurer.findOne({_id: req.params.insurerId}).lean();
        if(!insurer){
            Logger.log.error('No Insurer found', req.params.crmId);
            return res.status(400).send({status: 'ERROR', messageCode:'INSURER_NOT_FOUND', message: 'Insurer not found.'});
        }
        let contactsFromCrm = await getInsurerContacts({crmInsurerId:insurer.crmInsurerId,insurerId:insurer._id,limit:50,page:1,contacts:[]});
        let promiseArr = [];
        contactsFromCrm.forEach(crmContact => {
            promiseArr.push(InsurerUser.updateOne({crmContactId: crmContact.crmContactId, isDeleted: false}, crmContact, {upsert: true}));
        });
        await Promise.all(promiseArr);
        res.status(200).send({status: 'SUCCESS', message: 'Insurer Contacts synced successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in sync insurer contacts ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Export Router
 */
module.exports = router;
