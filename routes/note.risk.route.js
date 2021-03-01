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
router.get('/:entityId', async function (req, res) {
  if (!req.user || !req.user._id) {
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to get list.',
    });
  }
  if (
    !req.query.noteFor ||
    !req.params.entityId ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let query;
    if (req.query.noteFor === 'application') {
      const application = await Application.findOne({
        _id: req.params.entityId,
      });
      query = {
        $and: [
          {
            noteFor: req.query.noteFor,
            entityId: req.params.entityId,
          },
          {
            $or: [
              {
                createdByType: 'client-user',
                createdById: application.clientId,
              },
              { createdByType: 'user', isPublic: true },
              { createdByType: 'user', createdById: req.user._id },
            ],
          },
        ],
      };
    } else if (req.query.noteFor === 'debtor') {
      const [applications, debtor] = await Promise.all([
        Application.find({ debtorId: req.params.entityId }).lean(),
        ClientDebtor.findOne({ _id: req.params.entityId }).lean(),
      ]);
      const applicationIds = applications.map((i) => i._id);
      console.log('applicationIds : ', applicationIds);
      // const applications = await Application.find({debtorId:req.params.entityId}).lean();
      // const debtor = await ClientDebtor.findOne({_id:req.params.entityId});
      query = {
        $and: [
          {
            noteFor: req.query.noteFor,
            entityId: req.params.entityId,
          },
          {
            noteFor: 'application',
            entityId: { $in: applicationIds },
          },
          {
            $or: [
              { createdByType: 'client-user', createdById: debtor.clientId },
              { createdByType: 'user', isPublic: true },
              { createdByType: 'user', createdById: req.user._id },
            ],
          },
        ],
      };
    } else if (req.query.noteFor === 'client') {
      query = {
        $and: [
          {
            noteFor: req.query.noteFor,
            entityId: req.params.entityId,
          },
          {
            $or: [
              { createdByType: 'user', isPublic: true },
              { createdByType: 'user', createdById: req.user._id },
            ],
          },
        ],
      };
    }
    const notes = await Note.find(query);
    res.status(200).send({ status: 'SUCCESS', data: notes });
  } catch (e) {
    Logger.log.error('Error occurred in get note list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Create Note
 */
router.post('/', async function (req, res) {
  if (
    !req.body.noteFor ||
    !req.body.entityId ||
    !req.body.description ||
    !req.body.hasOwnProperty('isPublic')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const note = new Note({
      noteFor: req.body.noteFor,
      entityId: req.body.entityId,
      description: req.body.description,
      isPublic: req.body.isPublic,
      createdByType: 'user',
      createdById: req.user._id,
    });
    await note.save();
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Note created successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in create note ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Note
 */
router.put('/:noteId', async function (req, res) {
  if (
    !req.params.noteId ||
    !mongoose.Types.ObjectId.isValid(req.params.noteId) ||
    Object.keys(req.body).length === 0
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let updateObj = {};
    if (req.body.description) updateObj.description = req.body.description;
    if (req.body.hasOwnProperty('isPublic'))
      updateObj.isPublic = req.body.isPublic;
    await Note.updateOne({ _id: req.params.noteId }, updateObj);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Note updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in updating note ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Note
 */
router.delete('/:noteId', async function (req, res) {
  if (
    !req.params.noteId ||
    !mongoose.Types.ObjectId.isValid(req.params.noteId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    await Note.updateOne({ _id: req.params.noteId }, { isDeleted: true });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Note deleted successfully' });
  } catch (e) {
    Logger.log.error('Error occurred while deleting note ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Export Router
 */
module.exports = router;
