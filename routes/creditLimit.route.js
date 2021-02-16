/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');

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
        const module = StaticFile.modules.find(i => i.name === 'credit-limit');
        const debtorColumn = req.user.manageColumns.find(i => i.moduleName === 'credit-limit');
        let columnList = [];
        for (let i = 0; i < module.manageColumns.length; i++) {
            if(debtorColumn.columns.includes(module.manageColumns[i])){
                columnList.push({name:module.manageColumns[i],isChecked:true});
            } else {
                columnList.push({name:module.manageColumns[i],isChecked:false});
            }
        }
        res.status(200).send({status: 'SUCCESS', data: columnList});
    } catch (e) {
        Logger.log.error('Error occurred in get debtor column names', e.message || e);
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
    if (!req.body.hasOwnProperty('isReset') || !req.body.columns || req.body.columns.length === 0) {
        Logger.log.error('Require fields are missing');
        return res.status(400).send({status: 'ERROR', message: 'Something went wrong, please try again.'});
    }
    try {
        let updateColumns = [];
        if(req.body.isReset){
            const module = StaticFile.modules.find(i => i.name === 'credit-limit');
            updateColumns = module.defaultColumns;
        } else {
            updateColumns = req.body.columns;
        }
        await User.updateOne({_id:req.user._id,'manageColumns.moduleName':'credit-limit'},{$set:{'manageColumns.$.columns':updateColumns}});
        res.status(200).send({status: 'SUCCESS', message:'Columns updated successfully'});
    } catch (e) {
        Logger.log.error('Error occurred in update column names', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Export Router
 */
module.exports = router;
