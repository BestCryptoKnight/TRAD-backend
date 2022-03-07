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
const {
  addAuditLog,
  getEntityName,
  getRegexForSearch,
} = require('./../helper/audit-log.helper');
const { addNote } = require('./../helper/note.helper');

/**
 * Get Note List
 */
router.get('/:entityId', async function (req, res) {
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
    let aggregationQuery = [];
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    if (req.query.noteFor !== 'application') {
      req.query.limit = req.query.limit || 5;
      req.query.page = req.query.page || 1;
    }
    sortingOptions[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;

    if (req.query.noteFor === 'application') {
      const application = await Application.findOne({
        _id: req.params.entityId,
      });
      query = {
        $and: [
          { isDeleted: false },
          {
            noteFor: req.query.noteFor,
            entityId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            $or: [
              {
                createdByType: 'client-user',
                createdById: mongoose.Types.ObjectId(application.clientId),
              },
              { createdByType: 'user' },
              /*{
                createdByType: 'user',
                createdById: mongoose.Types.ObjectId(req.user._id),
              },*/
            ],
          },
        ],
      };
    } else if (req.query.noteFor === 'debtor') {
      const [applications, debtor] = await Promise.all([
        Application.find({ debtorId: req.params.entityId }).lean(),
        ClientDebtor.findOne({ debtorId: req.params.entityId }).lean(),
      ]);
      const applicationIds = applications.map((i) =>
        mongoose.Types.ObjectId(i._id),
      );
      const conditions = [
        { createdByType: 'user' },
        /* {
          createdByType: 'user',
          createdById: mongoose.Types.ObjectId(req.user._id),
        },*/
      ];
      if (debtor && debtor.clientId) {
        conditions.push({
          createdByType: 'client-user',
          createdById: mongoose.Types.ObjectId(debtor.clientId),
        });
      }
      query = {
        $and: [
          { isDeleted: false },
          {
            $or: [
              {
                noteFor: 'application',
                entityId: { $in: applicationIds },
              },
              {
                noteFor: req.query.noteFor,
                entityId: mongoose.Types.ObjectId(req.params.entityId),
              },
            ],
          },
          {
            $or: conditions,
          },
        ],
      };
    } else if (req.query.noteFor === 'client') {
      query = {
        $and: [
          { isDeleted: false },
          {
            noteFor: req.query.noteFor,
            entityId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            $or: [
              { createdByType: 'user' },
              /*{
                createdByType: 'user',
                createdById: mongoose.Types.ObjectId(req.user._id),
              },*/
            ],
          },
        ],
      };
    }

    aggregationQuery.push(
      {
        $addFields: {
          clientUserId: {
            $cond: [
              { $eq: ['$createdByType', 'client-user'] },
              '$createdById',
              null,
            ],
          },
          userId: {
            $cond: [{ $eq: ['$createdByType', 'user'] }, '$createdById', null],
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userId',
        },
      },
      {
        $lookup: {
          from: 'clients',
          localField: 'clientUserId',
          foreignField: '_id',
          as: 'clientUserId',
        },
      },
      {
        $addFields: {
          createdById: {
            $cond: [
              { $eq: ['$createdByType', 'client-user'] },
              '$clientUserId.name',
              '$userId.name',
            ],
          },
        },
      },
    );

    aggregationQuery.push({
      $project: {
        _id: 1,
        description: 1,
        createdAt: 1,
        updatedAt: 1,
        isPublic: 1,
        createdById: 1,
      },
    });
    aggregationQuery.push({ $sort: sortingOptions });

    if (req.query.limit && req.query.page) {
      aggregationQuery.push({
        $facet: {
          paginatedResult: [
            {
              $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
            },
            { $limit: parseInt(req.query.limit) },
          ],
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      });
    }

    if (req.query.search) {
      query.description = {
        $regex: getRegexForSearch(req.query.search),
        $options: 'i',
      };
    }
    aggregationQuery.unshift({ $match: query });
    const notes = await Note.aggregate(aggregationQuery).allowDiskUse(true);
    const headers = [
      {
        name: 'description',
        label: 'Description',
        type: 'string',
      },
      {
        name: 'isPublic',
        label: 'Is Public',
        type: 'booleanString',
      },
      {
        name: 'createdById',
        label: 'CreatedBy',
        type: 'string',
      },
      {
        name: 'createdAt',
        label: 'Created Date',
        type: 'date',
      },
      {
        name: 'updatedAt',
        label: 'Modified Date',
        type: 'date',
      },
    ];
    let response = [];
    if (notes && notes.length !== 0) {
      response = notes[0].paginatedResult ? notes[0].paginatedResult : notes;
      response.forEach((note) => {
        note.createdById =
          note.createdById && note.createdById[0] ? note.createdById[0] : '';
      });
    }
    const total =
      notes.length !== 0 &&
      notes[0]['totalCount'] &&
      notes[0]['totalCount'].length !== 0
        ? notes[0]['totalCount'][0]['count']
        : 0;

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: response,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get note list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Note Details
 */
router.get('/details/:noteId', async function (req, res) {
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
    const note = await Note.findById(req.params.noteId)
      .select({ __v: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: note });
  } catch (e) {
    Logger.log.error('Error occurred get note by id ', e.message || e);
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
    await addNote({
      noteFor: req.body.noteFor,
      entityId: req.body.entityId,
      description: req.body.description,
      isPublic: req.body.isPublic,
      userName: req.user.name,
      userId: req.user._id,
      userType: 'user',
    });
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
    const note = await Note.findById(req.params.noteId).lean();
    const entityName = await getEntityName({
      entityId: note.entityId,
      entityType: note.noteFor.toLowerCase(),
    });
    await addAuditLog({
      entityType: 'note',
      entityRefId: note._id,
      actionType: 'edit',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `A note for ${entityName} is successfully updated by ${req.user.name}`,
    });
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
    const note = await Note.findById(req.params.noteId).lean();
    const entityName = await getEntityName({
      entityId: note.entityId,
      entityType: note.noteFor.toLowerCase(),
    });
    await addAuditLog({
      entityType: 'note',
      entityRefId: note._id,
      actionType: 'delete',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `A note for ${entityName} is successfully deleted by ${req.user.name}`,
    });
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
