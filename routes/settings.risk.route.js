/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');

/*
* Local Imports
* */
const Logger = require('./../services/logger');

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
 * Export Router
 */
module.exports = router;
