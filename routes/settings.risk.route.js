/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const AuditLog = mongoose.model('audit-log');
const DocumentType = mongoose.model('document-type');

/*
* Local Imports
* */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Column Names
 */
router.get('/column-name',async function (req,res) {
    if (!req.user || !req.user._id) {
        return res.status(401).send({status: 'ERROR', messageCode:'UNAUTHORIZED', message: 'Please first login to get columns.'});
    }
    try {
        const module = StaticFile.modules.find(i => i.name === 'audit-logs');
        const auditLogsColumn = req.user.manageColumns.find(i => i.moduleName === 'audit-logs');
        let customFields = [];
        let defaultFields = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(auditLogsColumn && auditLogsColumn.columns.includes(module.manageColumns[i].name)){
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
        Logger.log.error('Error occurred in get audit-logs column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get Audit Logs
 */
router.get('/audit-logs',async function (req,res) {
   try {
       const logs = await AuditLog.find({}).lean();
       res.status(200).send({status: 'SUCCESS', data: logs});
   } catch (e) {
       Logger.log.error('Error occurred in get audit-logs ', e.message || e);
       res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
   }
});

/**
 * Get Document Types
 */
router.get('/document-type',async function (req,res) {
    try {
        const queryFilter = {
            isDeleted: false
        };
        const sortingOptions = {};
        if(req.query.sortBy && req.query.sortOrder){
            sortingOptions[req.query.sortBy] = req.query.sortOrder
        }
        if (req.query.search) queryFilter.name = {$regex: req.query.search, $options: 'i'};
        const option = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5,
        };
        option.sort = sortingOptions;
        option.lean = true;
        const documentTypes = await DocumentType.paginate(queryFilter,option);
        res.status(200).send({status: 'SUCCESS', data: documentTypes});
    } catch (e) {
        Logger.log.error('Error occurred in get document types ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get API Integration
 */
router.get('/api-integration', async function (req, res) {
    try {
        const organization = await Organization.findOne({isDeleted: false, _id: req.user.organizationId}).select({'integration': 1});
        res.status(200).send({status: 'SUCCESS', data: organization});
    } catch (e) {
        Logger.log.error('Error occurred in getting api integration ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Get origination details
 */
router.get('/origination-details', async function (req, res) {
    try {
        const organization = await Organization.findOne({isDeleted: false, _id: req.user.organizationId}).select({'name': 1, 'website': 1, 'contactNumber': 1, 'address': 1});
        res.status(200).send({status: 'SUCCESS', data: organization});
    } catch (e) {
        Logger.log.error('Error occurred in getting organization details ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Add Document Type
 */
router.post('/document-type',async function (req,res) {
    if (!req.body.documentTitle || !req.body.documentFor) {
        return res.status(400).send({status: 'ERROR',  messageCode:'REQUIRE_FIELD_MISSING', message: 'Require fields are missing.'});
    }
    try {
        let document = await DocumentType.findOne({isDeleted:false,documentFor:req.body.documentFor,documentTitle:req.body.documentTitle}).lean();
        if(document){
            return res.status(400).send({status: 'ERROR',  messageCode:'DOCUMENT_TYPE_ALREADY_EXISTS', message: 'Document type already exists'});
        } else {
            document = new DocumentType({
                documentFor:req.body.documentFor,
                documentTitle:req.body.documentTitle
            });
            await document.save();
            res.status(200).send({status: 'SUCCESS', data: document});
        }
    } catch (e) {
        Logger.log.error('Error occurred in add document types ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Document Type
 */
router.put('/document-type/:documentId',async function (req,res) {
    if (!req.params.documentId || !mongoose.Types.ObjectId.isValid(req.params.documentId) || !req.body.documentTitle || !req.body.documentFor) {
        return res.status(400).send({status: 'ERROR',  messageCode:'REQUIRE_FIELD_MISSING', message: 'Require fields are missing.'});
    }
    try {
        const document = await DocumentType.findOne({isDeleted:false,documentFor:req.body.documentFor,documentTitle:req.body.documentTitle}).lean();
        if(document && document._id !== req.params.documentId){
            return res.status(400).send({status: 'ERROR',  messageCode:'DOCUMENT_TYPE_ALREADY_EXISTS', message: 'Document type already exists'});
        } else {
            await DocumentType.updateOne({_id:req.params.documentId},{documentFor:req.body.documentFor, documentTitle:req.body.documentTitle});
            res.status(200).send({status: 'SUCCESS', message: 'Document type updated successfully'});
        }
    } catch (e) {
        Logger.log.error('Error occurred in update document types ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

//TODO change
/**
 * Update API Integration
 */
router.put('/api-integration',async function (req,res) {
    if (!req.body.rss || !req.body.equifax|| !req.body.illion || !req.body.abr || !req.body.rss.accessToken) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
   try {
       await Organization.updateOne({isDeleted: false, _id: req.user.organizationId},{integration:req.body});
       const organization = await Organization.findOne({isDeleted: false, _id: req.user.organizationId}).select({'integration': 1});
       res.status(200).send({status:'SUCCESS',data:organization})
   } catch (e) {
       Logger.log.error('Error occurred in updating api integration ', e.message || e);
       res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
   }
});

/**
 * Update origination details
 */
router.put('/origination-details',async function (req,res) {
    if (!req.body.name || !req.body.website|| !req.body.contactNumber || !req.body.location) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
    try {
        await Organization.updateOne({isDeleted: false, _id: req.user.organizationId},{name:req.body.name,website:req.body.website,contactNumber:req.body.contactNumber,address:req.body.location});
        const organization = await Organization.findOne({isDeleted: false, _id: req.user.organizationId}).select({'name': 1, 'website': 1, 'contactNumber': 1, 'address': 1});
        res.status(200).send({status:'SUCCESS',data:organization})
    } catch (e) {
        Logger.log.error('Error occurred in updating api integration ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Delete Document Type
 */
router.put('/document-type/:documentId',async function (req,res) {
    if (!req.params.documentId) {
        return res.status(400).send({status: 'ERROR',  messageCode:'REQUIRE_FIELD_MISSING', message: 'Require fields are missing.'});
    }
    try {
        await DocumentType.updateOne({_id:req.params.documentId},{isDeleted:true});
        res.status(200).send({status: 'SUCCESS', message: 'Document type deleted successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update document types ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Export Router
 */
module.exports = router;
