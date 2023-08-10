/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Document = mongoose.model('document');
const ClientDebtor = mongoose.model('client-debtor');
const Application = mongoose.model('application');
const DocumentType = mongoose.model('document-type');

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
  createZipFile,
  downloadDocument,
  uploadFile,
} = require('./../helper/static-file.helper');
const {
  addAuditLog,
  getEntityName,
  getRegexForSearch,
} = require('./../helper/audit-log.helper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor,
    );
    const auditLogsColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
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
  if (!req.query.documentIds || !req.query.action) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const documentIds = req.query.documentIds.split(',');
    const documentData = await Document.find({ _id: { $in: documentIds } })
      .select('_id keyPath originalFileName mimeType')
      .lean();
    if (req.query.action.toLowerCase() === 'view') {
      let response;
      if (documentData.length === 1) {
        if (documentData[0].keyPath) {
          response = await getPreSignedUrl({
            filePath: documentData[0].keyPath,
            getCloudFrontUrl: config.staticServing.isCloudFrontEnabled,
          });
        }
      }
      res.status(200).send({ status: 'SUCCESS', data: response });
    } else {
      if (documentData.length === 1) {
        let response;
        if (documentData[0].keyPath && documentData[0].mimeType) {
          response = await downloadDocument({
            filePath: documentData[0].keyPath,
          });
          res.setHeader('Content-Type', documentData[0].mimeType);
          res.setHeader(
            'Content-Disposition',
            'attachment; filename=' + documentData[0].originalFileName,
          );
          return response.pipe(res);
        }
        res.status(200).send({ status: 'SUCCESS', data: response });
      } else {
        const zipFile = await createZipFile({ documentData });
        const timestamp = new Date().getTime();
        const fileName = timestamp + '.zip';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=' + fileName,
        );
        return zipFile.pipe(res);
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in download document ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Document Type List
 */
router.get('/document-type-list', async function (req, res) {
  if (!req.query.listFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const query = {
      isDeleted: false,
      documentFor: req.query.listFor.toLowerCase(),
    };
    const documentTypes = await DocumentType.find(query)
      .select('_id documentTitle')
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: documentTypes });
  } catch (e) {
    Logger.log.error('Error occurred in get document types ', e.message || e);
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
    let documentColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.documentFor + '-document',
    );

    let query;
    let aggregationQuery = [];
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';

    sortingOptions[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;

    if (req.query.documentFor === 'application') {
      documentColumn = documentColumn || {};
      documentColumn.columns = [
        'documentTypeId',
        'description',
        'uploadById',
        'createdAt',
      ];
      const application = await Application.findOne({
        _id: req.params.entityId,
      });
      const conditions = [
        {
          uploadByType: 'client-user',
          uploadById: mongoose.Types.ObjectId(application.clientId),
        },
        { uploadByType: 'user' },
      ];
      /*if (req.user._id) {
        conditions.push({
          uploadByType: 'user',
          uploadById: mongoose.Types.ObjectId(req.user._id),
        });
      }*/
      query = {
        $and: [
          { isDeleted: false },
          {
            entityRefId: mongoose.Types.ObjectId(req.params.entityId),
          },
          {
            $or: conditions,
          },
        ],
      };
    } else if (req.query.documentFor === 'debtor') {
      const [applications, debtor] = await Promise.all([
        Application.find({ debtorId: req.params.entityId }).lean(),
        ClientDebtor.findOne({ debtorId: req.params.entityId }).lean(),
      ]);
      const applicationIds = applications.map((i) =>
        mongoose.Types.ObjectId(i._id),
      );
      query = {
        $and: [
          { isDeleted: false },
          { entityRefId: { $in: applicationIds } },
        ],
      };
    } else if (req.query.documentFor === 'client') {
      query = {
        $and: [
          { isDeleted: false },
          {
            entityRefId: mongoose.Types.ObjectId(req.params.entityId),
          },
          { uploadByType: 'user' },
          /*{
            $or: [
              { uploadByType: 'user', isPublic: true },
              {
                uploadByType: 'user',
                uploadById: mongoose.Types.ObjectId(req.user._id),
              },
            ],
          },*/
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
            from: 'clients',
            localField: 'clientUserId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $addFields: {
            uploadById: {
              $cond: [
                { $eq: ['$uploadByType', 'client-user'] },
                '$clientId.name',
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
            preserveNullAndEmptyArrays: true,
          },
        },
      );
    }

    if (req.query.search) {
      aggregationQuery.push({
        $match: {
          $or: [
            {
              'documentTypeId.documentTitle': {
                $regex: getRegexForSearch(req.query.search),
                $options: 'i',
              },
            },
            {
              description: {
                $regex: getRegexForSearch(req.query.search),
                $options: 'i',
              },
            },
            {
              originalFileName: {
                $regex: getRegexForSearch(req.query.search),
                $options: 'i',
              },
            },
          ],
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

    aggregationQuery.unshift({ $match: query });

    const documents = await Document.aggregate(aggregationQuery).allowDiskUse(
      true,
    );
    const headers = [];
    let response = [];
    if (module) {
      for (let i = 0; i < module.manageColumns.length; i++) {
        if (documentColumn.columns.includes(module.manageColumns[i].name)) {
          headers.push(module.manageColumns[i]);
        }
      }
    }
    if (documents && documents.length !== 0) {
      response = documents[0]['paginatedResult']
        ? documents[0]['paginatedResult']
        : documents;
      response.forEach((document) => {
        if (documentColumn.columns.includes('documentTypeId')) {
          document.documentTypeId =
            document?.documentTypeId?.documentTitle || '';
        }
        if (documentColumn.columns.includes('uploadById')) {
          document.uploadById = document.uploadById[0] || '';
        }
      });
    }
    const total =
      documents.length !== 0 &&
      documents[0]['totalCount'] &&
      documents[0]['totalCount'].length !== 0
        ? documents[0]['totalCount'][0]['count']
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
    (req.body.documentFor !== 'application' && !req.body.description) ||
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
      description: req.body.description ? req.body.description : null,
      isPublic: req.body.isPublic,
      entityRefId: req.body.entityId,
      documentTypeId: req.body.documentType,
      originalFileName: req.file.originalname,
      bufferData: req.file.buffer,
      mimeType: req.file.mimetype,
      uploadById: req.user._id,
      uploadByType: 'user',
      userName: req.user.name,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Document uploaded successfully',
      data: {
        _id: document._id,
        documentTypeId: document.documentTypeId,
        description: document.description,
        originalFileName: document.originalFileName,
        uploadById: document.uploadById,
        isPublic: document.isPublic,
        createdAt: document.createdAt,
      },
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
 * Upload for Document publicly
 */
router.post('/upload-public', upload.single('document'), async (req, res) => {
  req.body = JSON.parse(JSON.stringify(req.body));
  if (!req.body.filePath || !req.body.hasOwnProperty('isPublicFile')) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    const s3Response = await uploadFile({
      file: req.file.buffer,
      filePath: req.body.filePath + '/' + req.file.originalname,
      fileType: req.file.mimetype,
      isPublicFile: req.body.isPublicFile,
    });
    res.status(200).send({ status: 'success', data: s3Response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in upload document for public access',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later',
    });
  }
});

/**
 * Update Column Names
 */
router.put('/column-name', async function (req, res) {
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let updateColumns = [];
    switch (req.body.columnFor) {
      case 'client-document':
      case 'debtor-document':
        if (req.body.isReset) {
          module = StaticFile.modules.find(
            (i) => i.name === req.body.columnFor,
          );
          updateColumns = module.defaultColumns;
        } else {
          updateColumns = req.body.columns;
        }
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': req.body.columnFor },
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
    const document = await Document.findOne({
      _id: req.params.documentId,
    }).lean();
    if (document.keyPath) {
      await deleteFile({ filePath: document.keyPath });
    }
    await Document.updateOne(
      { _id: req.params.documentId },
      { isDeleted: true },
    );
    if (document.entityRefId && document.entityType) {
      const entityName = await getEntityName({
        entityId: document.entityRefId,
        entityType: document.entityType.toLowerCase(),
      });
      await addAuditLog({
        entityType: 'document',
        entityRefId: document._id,
        actionType: 'delete',
        userType: 'user',
        userRefId: req.user._id,
        logDescription: `A document for ${entityName} is successfully deleted by ${req.user.name}`,
      });
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Document deleted successfully' });
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
