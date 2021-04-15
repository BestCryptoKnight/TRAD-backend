/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const AuditLog = mongoose.model('audit-log');
const DocumentType = mongoose.model('document-type');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'audit-logs');
    const auditLogsColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'audit-logs',
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
      'Error occurred in get audit-logs column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

//TODO add condition for claims and overdue
/**
 * Get Audit Logs
 */
router.get('/audit-logs', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'audit-logs');
    const auditLogsColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'audit-logs',
    );
    let queryFilter = {};
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder === 'desc' ? -1 : 1;

    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      queryFilter.userRefId = mongoose.Types.ObjectId(req.user._id);
    }
    if (req.query.actionType) {
      queryFilter.actionType = req.query.actionType.toLowerCase();
    }
    if (req.query.entityType) {
      queryFilter.entityType = req.query.entityType.toLowerCase();
    }
    if (req.query.startDate || req.query.endDate) {
      let dateQuery = {};
      if (req.query.startDate) {
        dateQuery = {
          $gte: new Date(req.query.startDate),
        };
      }
      if (req.query.endDate) {
        dateQuery = Object.assign({}, dateQuery, {
          $lt: new Date(req.query.endDate),
        });
      }
      queryFilter.createdAt = dateQuery;
    }

    let query = [];
    if (auditLogsColumn.columns.includes('entityRefId')) {
      query.push(
        {
          $addFields: {
            userId: {
              $cond: [{ $eq: ['$entityType', 'user'] }, '$entityRefId', null],
            },
            clientId: {
              $cond: [{ $eq: ['$entityType', 'client'] }, '$entityRefId', null],
            },
            clientUserId: {
              $cond: [
                { $eq: ['$entityType', 'client-user'] },
                '$entityRefId',
                null,
              ],
            },
            debtorId: {
              $cond: [{ $eq: ['$entityType', 'debtor'] }, '$entityRefId', null],
            },
            applicationId: {
              $cond: [
                { $eq: ['$entityType', 'application'] },
                '$entityRefId',
                null,
              ],
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
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
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
          $lookup: {
            from: 'client-debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId.debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $lookup: {
            from: 'applications',
            localField: 'applicationId',
            foreignField: '_id',
            as: 'applicationId',
          },
        },
        {
          $addFields: {
            entityRefId: {
              $cond: [
                { $eq: ['$entityType', 'client'] },
                '$clientId.name',
                {
                  $cond: [
                    { $eq: ['$entityType', 'debtor'] },
                    '$debtorId.entityName',
                    {
                      $cond: [
                        { $eq: ['$entityType', 'application'] },
                        '$applicationId.applicationId',
                        {
                          $cond: [
                            { $eq: ['$entityType', 'client-user'] },
                            '$clientUserId.name',
                            {
                              $cond: [
                                { $eq: ['$entityType', 'user'] },
                                '$userId.name',
                                null,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      );
    }

    if (auditLogsColumn.columns.includes('userRefId') || req.query.userRefId) {
      query.push(
        {
          $addFields: {
            clientUserId: {
              $cond: [
                { $eq: ['$userType', 'client-user'] },
                '$userRefId',
                null,
              ],
            },
            userId: {
              $cond: [{ $eq: ['$userType', 'user'] }, '$userRefId', null],
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
            userRefId: {
              $cond: [
                { $eq: ['$userType', 'client-user'] },
                {
                  name: '$clientUserId.name',
                  _id: '$clientUserId._id',
                },
                {
                  name: '$userId.name',
                  _id: '$userId._id',
                },
              ],
            },
          },
        },
      );
    }
    if (req.query.userRefId) {
      query.push({
        $match: {
          'userRefId._id': mongoose.Types.ObjectId(req.query.userRefId),
        },
      });
    }

    const fields = auditLogsColumn.columns.map((i) => [i, 1]);
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    query.push({ $sort: sortingOptions });

    query.push({
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
    query.unshift({ $match: queryFilter });

    const auditLogs = await AuditLog.aggregate(query).allowDiskUse(true);

    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (auditLogsColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (auditLogs && auditLogs.length !== 0) {
      auditLogs[0].paginatedResult.forEach((log) => {
        if (auditLogsColumn.columns.includes('entityRefId')) {
          log.entityRefId =
            log.entityRefId && log.entityRefId[0] ? log.entityRefId[0] : '';
        }
        if (auditLogsColumn.columns.includes('userRefId')) {
          log.userRefId =
            log.userRefId && log.userRefId.name && log.userRefId.name[0]
              ? log.userRefId.name[0]
              : '';
        }
        if (log.actionType) {
          log.actionType =
            log.actionType.charAt(0).toUpperCase() + log.actionType.slice(1);
        }
        if (log.entityType) {
          log.entityType = log.entityType
            .replace(/-/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
        }
        if (log.userType) {
          log.userType =
            log.userType.charAt(0).toUpperCase() + log.userType.slice(1);
        }
      });
    }
    const total =
      auditLogs[0]['totalCount'].length !== 0
        ? auditLogs[0]['totalCount'][0]['count']
        : 0;

    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: auditLogs[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get audit-logs ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Document Types
 */
router.get('/document-type', async function (req, res) {
  try {
    const queryFilter = {
      isDeleted: false,
    };
    if (req.query.listFor) {
      queryFilter.documentFor = req.query.listFor.toLowerCase();
    }
    const sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
    if (req.query.search)
      queryFilter.name = { $regex: req.query.search, $options: 'i' };
    const option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select = '_id documentFor documentTitle updatedAt';
    option.sort = sortingOptions;
    option.lean = true;
    const documentTypes = await DocumentType.paginate(queryFilter, option);
    documentTypes.headers = [
      {
        name: 'documentTitle',
        label: 'Document Type',
        type: 'string',
      },
      {
        name: 'documentFor',
        label: 'Document For',
        type: 'string',
      },
      {
        name: 'updatedAt',
        label: 'Modified Date',
        type: 'date',
      },
    ];
    if (
      documentTypes &&
      documentTypes.docs &&
      documentTypes.docs.length !== 0
    ) {
      documentTypes.docs.forEach((document) => {
        delete document.id;
      });
    }
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
 * Get Document Type Details
 */
router.get('/document-type-details/:documentTypeId', async function (req, res) {
  if (
    !req.params.documentTypeId ||
    !mongoose.Types.ObjectId.isValid(req.params.documentTypeId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const documentType = await DocumentType.findById(req.params.documentTypeId)
      .select('_id documentFor documentTitle')
      .lean();
    if (documentType.documentFor) {
      documentType.documentFor = [
        {
          label:
            documentType.documentFor.charAt(0).toUpperCase() +
            documentType.documentFor.slice(1),
          value: documentType.documentFor,
        },
      ];
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: documentType,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get document type details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get API Integration
 */
router.get('/api-integration', async function (req, res) {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
      _id: req.user.organizationId,
    })
      .select({ integration: 1 })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: organization });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting api integration ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get origination details
 */
router.get('/origination-details', async function (req, res) {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
      _id: req.user.organizationId,
    })
      .select({ name: 1, website: 1, contactNumber: 1, address: 1, email: 1 })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: organization });
  } catch (e) {
    Logger.log.error(
      'Error occurred in getting organization details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Add Document Type
 */
router.post('/document-type', async function (req, res) {
  if (!req.body.documentTitle || !req.body.documentFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let document = await DocumentType.findOne({
      isDeleted: false,
      documentFor: req.body.documentFor,
      documentTitle: req.body.documentTitle,
    }).lean();
    if (document) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOCUMENT_TYPE_ALREADY_EXISTS',
        message: 'Document type already exists',
      });
    } else {
      document = new DocumentType({
        documentFor: req.body.documentFor,
        documentTitle: req.body.documentTitle,
      });
      await document.save();
      res.status(200).send({ status: 'SUCCESS', data: document });
    }
  } catch (e) {
    Logger.log.error('Error occurred in add document types ', e.message || e);
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
      const module = StaticFile.modules.find((i) => i.name === 'audit-logs');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'audit-logs' },
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
 * Update Document Type
 */
router.put('/document-type/:documentId', async function (req, res) {
  if (
    !req.params.documentId ||
    !mongoose.Types.ObjectId.isValid(req.params.documentId) ||
    !req.body.documentTitle ||
    !req.body.documentFor
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const document = await DocumentType.findOne({
      isDeleted: false,
      documentFor: req.body.documentFor,
      documentTitle: req.body.documentTitle,
    }).lean();
    if (document && document._id !== req.params.documentId) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOCUMENT_TYPE_ALREADY_EXISTS',
        message: 'Document type already exists',
      });
    } else {
      await DocumentType.updateOne(
        { _id: req.params.documentId },
        {
          documentFor: req.body.documentFor,
          documentTitle: req.body.documentTitle,
        },
      );
      res.status(200).send({
        status: 'SUCCESS',
        message: 'Document type updated successfully',
      });
    }
  } catch (e) {
    Logger.log.error(
      'Error occurred in update document types ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update API Integration
 */
router.put('/api-integration', async function (req, res) {
  if (!req.body.apiName) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let update;
    switch (req.body.apiName) {
      case 'rss':
        if (!req.body.accessToken) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing.',
          });
        }
        update = { 'integration.rss.accessToken': req.body.accessToken };
        break;
      case 'abn':
        if (!req.body.guid) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing.',
          });
        }
        update = { 'integration.abn.guid': req.body.guid };
        break;
      case 'equifax':
        if (!req.body.username || !req.body.password) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing.',
          });
        }
        update = {
          'integration.equifax.username': req.body.username,
          'integration.equifax.password': req.body.password,
        };
        break;
      case 'illion':
        if (!req.body.userId || !req.body.password || !req.body.subscriberId) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing.',
          });
        }
        update = {
          'integration.illion.userId': req.body.userId,
          'integration.illion.password': req.body.password,
          'integration.illion.subscriberId': req.body.subscriberId,
        };
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    await Organization.updateOne(
      { isDeleted: false, _id: req.user.organizationId },
      update,
    );
    const organization = await Organization.findOne({
      isDeleted: false,
      _id: req.user.organizationId,
    }).select({ integration: 1 });
    res.status(200).send({ status: 'SUCCESS', data: organization });
  } catch (e) {
    Logger.log.error(
      'Error occurred in updating api integration ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update origination details
 */
router.put('/origination-details', async function (req, res) {
  if (
    !req.body.name ||
    !req.body.website ||
    !req.body.contactNumber ||
    !req.body.email ||
    !req.body.address
  ) {
    return res.status(400).send({
      status: 'ERROR',
      message: 'Something went wrong.',
    });
  }
  try {
    await Organization.updateOne(
      { isDeleted: false, _id: req.user.organizationId },
      {
        name: req.body.name,
        website: req.body.website,
        contactNumber: req.body.contactNumber,
        address: req.body.address,
        email: req.body.email,
      },
    );
    const organization = await Organization.findOne({
      isDeleted: false,
      _id: req.user.organizationId,
    }).select({ name: 1, website: 1, contactNumber: 1, address: 1 });
    res.status(200).send({ status: 'SUCCESS', data: organization });
  } catch (e) {
    Logger.log.error(
      'Error occurred in updating api integration ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Document Type
 */
router.delete('/document-type/:documentId', async function (req, res) {
  if (!req.params.documentId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await DocumentType.updateOne(
      { _id: req.params.documentId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Document type deleted successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in update document types ',
      e.message || e,
    );
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
