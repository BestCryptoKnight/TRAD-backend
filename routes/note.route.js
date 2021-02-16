/*
* Module Imports
* */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Note = mongoose.model('note');
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');

/*
* Local Imports
* */
const Logger = require('./../services/logger');

/**
 * Get Note List
 */
router.get('/:entityId',async function (req,res) {
    if (!req.query.noteFor || !req.params.entityId || !mongoose.Types.ObjectId.isValid(req.params.entityId)) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
    try {
        let clientId;
        if(req.query.noteFor === 'application'){
            const application = await Application.findOne({_id:req.params.entityId});
            clientId = application.clientId;
        } else if (req.query.noteFor === 'debtor'){
            const debtor = await ClientDebtor.findOne({_id:req.params.entityId});
            clientId = debtor.clientId;
        }
        const notes = await Note.find({ $and: [{noteFor:req.query.noteFor,entityId:req.params.entityId},{$or:[{createdByType:'client-user',createdById:clientId},{createdByType:'user',isPublic: true}]}]});
        res.status(200).send({status:'SUCCESS',data:notes})
    } catch (e) {
        Logger.log.error('Error occurred in get note list ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Create Note
 */
router.post('/',async function (req,res) {
    if (!req.body.noteFor || !req.body.entityId || !req.body.description || !req.body.hasOwnProperty('isPublic')) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
    try {
        const note = new Note({
            noteFor: req.body.noteFor,
            entityId: req.body.entityId,
            description: req.body.description,
            isPublic: req.body.isPublic,
            createdByType: 'client-user',
            createdById: req.user.clientId,
        });
        await note.save();
        res.status(200).send({status:'SUCCESS',message:'Note created successfully'})
    } catch (e) {
        Logger.log.error('Error occurred in create note ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Update Note
 */
router.put('/:noteId',async function (req,res) {
    if (!req.params.noteId || !mongoose.Types.ObjectId.isValid(req.params.noteId) || !req.body.description) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
    try {
        await Note.updateOne({_id:req.params.noteId},{description:req.body.description});
        res.status(200).send({status:'SUCCESS',message:'Note updated successfully'})
    } catch (e) {
        Logger.log.error('Error occurred in updating note ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Delete Note
 */
router.delete('/:noteId',async function (req,res) {
    if (!req.params.noteId || !mongoose.Types.ObjectId.isValid(req.params.noteId)) {
        return res.status(400).send({
            status: "ERROR",
            message: 'Something went wrong.',
        });
    }
    try {
        await Note.updateOne({_id:req.params.noteId},{isDeleted:true});
        res.status(200).send({status:'SUCCESS',message:'Note deleted successfully'})
    } catch (e) {
        Logger.log.error('Error occurred while deleting note ', e.message || e);
        res.status(500).send({status: 'ERROR', message: e.message || 'Something went wrong, please try again later.'});
    }
});

/**
 * Export Router
 */
module.exports = router;
