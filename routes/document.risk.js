/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const Document = mongoose.model('document');
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const config = require('./../config');
const StaticFile = require('./../static-files/moduleColumn');
const { uploadDocument } = require('./../helper/document.helper');
const {
  deleteFile,
  getPreSignedUrl,
} = require('./../helper/static-file.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.user || !req.user._id) {
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to get columns.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'document');
    const auditLogsColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'document',
    );
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        auditLogsColumn &&
        auditLogsColumn.columns.includes(module.manageColumns[i].name)
      ) {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: true,
          });
        }
      } else {
        if (module.defaultColumns.includes(module.manageColumns[i].name)) {
          defaultFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        } else {
          customFields.push({
            name: module.manageColumns[i].name,
            label: module.manageColumns[i].label,
            isChecked: false,
          });
        }
      }
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', data: { defaultFields, customFields } });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get document column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download documents
 */
router.get('/download', async function (req, res) {
  if (!req.query.documentIds) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const documentIds = req.query.documentIds.split(',');
    const documentData = await Document.find({ _id: { $in: documentIds } })
      .select('_id keyPath')
      .lean();
    let promises = [];
    for (let i = 0; i < documentData.length; i++) {
      if (documentData[i].keyPath) {
        promises.push(
          getPreSignedUrl({
            filePath: documentData[i].keyPath,
            getCloudFrontUrl: config.staticServing.isCloudFrontEnabled,
          }),
        );
      }
    }
    const response = await Promise.all(promises);
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in download document ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Document list
 */
router.get('/:entityId', async function (req, res) {
  if (
    !req.query.documentFor ||
    !req.params.entityId ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.documentFor + '-document',
    );
    const documentColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.documentFor + '-document',
    );

    let query;
    let aggregationQuery = [];
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    req.query.limit = req.query.limit || 5;
    req.query.page = req.query.page || 1;
    sortingOptions[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;

    if (req.query.documentFor === 'application') {
      const application = await Application.findOne({
        _id: req.params.entityId,
      });
      query = {
        $and: [
          {
            entityRefId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            $or: [
              {
                uploadByType: 'client-user',
                uploadById: mongoose.Types.ObjectId(application.clientId),
              },
              { uploadByType: 'user', isPublic: true },
              {
                uploadByType: 'user',
                uploadById: mongoose.Types.ObjectId(req.user._id),
              },
            ],
          },
        ],
      };
    } else if (req.query.documentFor === 'debtor') {
      const [applications, debtor] = await Promise.all([
        Application.find({ debtorId: req.params.entityId }).lean(),
        ClientDebtor.findOne({ _id: req.params.entityId }).lean(),
      ]);
      const applicationIds = applications.map((i) => i._id);
      console.log('applicationIds : ', applicationIds);
      query = {
        $and: [
          {
            entityRefId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            entityRefId: { $in: applicationIds },
          },
          {
            $or: [
              {
                uploadByType: 'client-user',
                uploadById: mongoose.Types.ObjectId(debtor.clientId),
              },
              { uploadByType: 'user', isPublic: true },
              {
                uploadByType: 'user',
                uploadById: mongoose.Types.ObjectId(req.user._id),
              },
            ],
          },
        ],
      };
    } else if (req.query.documentFor === 'client') {
      query = {
        $and: [
          {
            entityRefId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            $or: [
              { uploadByType: 'user', isPublic: true },
              {
                uploadByType: 'user',
                uploadById: mongoose.Types.ObjectId(req.user._id),
              },
            ],
          },
        ],
      };
    }

    if (documentColumn.columns.includes('uploadById')) {
      aggregationQuery.push(
        {
          $addFields: {
            clientUserId: {
              $cond: [
                { $eq: ['$uploadByType', 'client-user'] },
                '$uploadById',
                null,
              ],
            },
            userId: {
              $cond: [{ $eq: ['$uploadByType', 'user'] }, '$uploadById', null],
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
            from: 'client-users',
            localField: 'clientUserId',
            foreignField: '_id',
            as: 'clientUserId',
          },
        },
        {
          $addFields: {
            uploadById: {
              $cond: [
                { $eq: ['$createdByType', 'client-user'] },
                '$clientUserId.name',
                '$userId.name',
              ],
            },
          },
        },
      );
    }

    if (documentColumn.columns.includes('documentTypeId') || req.query.search) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'document-types',
            localField: 'documentTypeId',
            foreignField: '_id',
            as: 'documentTypeId',
          },
        },
        {
          $unwind: {
            path: '$documentTypeId',
          },
        },
      );
    }

    if (req.query.search) {
      aggregationQuery.push({
        $match: {
          'documentTypeId.documentTitle': {
            $regex: `${req.query.search}`,
            $options: 'i',
          },
        },
      });
    }

    const fields = documentColumn.columns.map((i) => {
      if (i === 'documentTypeId') {
        i = i + '.documentTitle';
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    aggregationQuery.push({ $sort: sortingOptions });

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

    aggregationQuery.unshift({ $match: query });

    const documents = await Document.aggregate(aggregationQuery).allowDiskUse(
      true,
    );
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (documentColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (documents && documents.length !== 0) {
      documents[0].paginatedResult.forEach((document) => {
        if (documentColumn.columns.includes('documentTypeId')) {
          document.documentTypeId = document.documentTypeId.documentTitle || '';
        }
        if (documentColumn.columns.includes('uploadById')) {
          document.uploadById = document.uploadById[0] || '';
        }
      });
    }
    const total =
      documents[0]['totalCount'].length !== 0
        ? documents[0]['totalCount'][0]['count']
        : 0;

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: documents[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get document list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Upload Document
 */
router.post('/upload', upload.single('document'), async function (req, res) {
  req.body = JSON.parse(JSON.stringify(req.body));
  if (
    !req.body.documentFor ||
    !req.body.description ||
    !req.body.documentType ||
    !req.body.entityId ||
    !req.body.hasOwnProperty('isPublic')
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const documentTypes = ['client', 'debtor', 'application'];
    if (!documentTypes.includes(req.body.documentFor.toLowerCase())) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    const document = await uploadDocument({
      entityType: req.body.documentFor.toLowerCase(),
      description: req.body.description,
      isPublic: req.body.isPublic,
      entityRefId: req.body.entityId,
      documentTypeId: req.body.documentType,
      originalFileName: req.file.originalname,
      bufferData: req.file.buffer,
      mimetype: req.file.mimetype,
      uploadById: req.user._id,
      uploadByType: 'user',
    });
    await addAuditLog({
      entityType: 'document',
      entityRefId: document._id,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'add',
      logDescription: 'Document uploaded successfully',
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Document uploaded successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in upload document ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
  if (!req.user || !req.user._id) {
    Logger.log.error('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.error('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'document');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'document' },
      { $set: { 'manageColumns.$.columns': updateColumns } },
    );
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Columns updated successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in update column names', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Document
 */
router.delete('/:documentId', async function (req, res) {
  if (!req.params.documentId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const document = await Document.findOne({ _id: req.params.documentId })
      .select('keyPath')
      .lean();
    await deleteFile({ filePath: document.keyPath });
    await Document.updateOne(
      { _id: req.params.documentId },
      { isDeleted: true },
    );
    await addAuditLog({
      entityType: 'document',
      entityRefId: req.params.documentId,
      userType: 'user',
      userRefId: req.user._id,
      actionType: 'delete',
      logDescription: 'Document deleted successfully',
    });
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Document deleted successfully.' });
  } catch (e) {
    Logger.log.error('Error occurred in delete document ', e.message || e);
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
