/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
let mongoose = require('mongoose');
let Organization = mongoose.model('organization');
const DocumentType = mongoose.model('document-type');
const User = mongoose.model('user');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getAccessBaseUserList } = require('./../helper/user.helper');
const { getClients } = require('./../helper/rss.helper');
const {
  getEntityDetailsByABN,
  getEntityDetailsByNZBN,
} = require('./../helper/abr.helper');
const { fetchCreditReportInPDFFormat } = require('./../helper/illion.helper');
const {
  addAuditLog,
  getRegexForSearch,
  formatString,
  getAuditLogs,
  getAuditLogList,
} = require('./../helper/audit-log.helper');

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

/**
 * Get User List
 */
router.get('/user-list', async function (req, res) {
  try {
    const hasFullAccess = !!(
      req.accessTypes && req.accessTypes.indexOf('full-access') !== -1
    );
    const users = await getAccessBaseUserList({
      userId: req.user._id,
      hasFullAccess: hasFullAccess,
    });
    const userIds = users.map((i) => i._id.toString());
    if (!userIds.includes(req.user._id.toString())) {
      users.push({ _id: req.user._id, name: req.user.name });
    }
    res.status(200).send({ status: 'SUCCESS', data: users });
  } catch (e) {
    Logger.log.error('Error occurred in get user list ', e.message || e);
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
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const response = await getAuditLogList({
      hasFullAccess,
      userId: req.user._id,
      moduleColumn: module.manageColumns,
      requestedQuery: req.query,
      auditLogColumn: auditLogsColumn.columns,
    });

    res.status(200).send({
      status: 'SUCCESS',
      data: response,
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
 * Get Entity Specific Logs
 */
router.get('/audit-logs/:entityId', async function (req, res) {
  if (
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
    const application = await Application.findById(req.params.entityId).lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const response = await getAuditLogs({ entityId: application._id });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get application modules data ',
      e.message || e,
    );
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
    if (req.query.search) {
      queryFilter.name = {
        $regex: getRegexForSearch(req.query.search),
        $options: 'i',
      };
    }
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
        document.documentFor = formatString(document.documentFor);
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
    Logger.log.error(
      'Error occurred in get document types list',
      e.message || e,
    );
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
      documentType.documentFor = {
        label:
          documentType.documentFor.charAt(0).toUpperCase() +
          documentType.documentFor.slice(1),
        value: documentType.documentFor,
      };
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
 * Test credentials
 */
router.get('/test-credentials', async function (req, res) {
  if (!req.query.apiName) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let response;
    let areCredentialsValid = false;
    switch (req.query.apiName) {
      case 'rss':
        response = await getClients({ searchKeyword: '' });
        areCredentialsValid = response && Array.isArray(response);
        break;
      case 'abn':
        response = await getEntityDetailsByABN({ searchString: 51069691676 });
        areCredentialsValid =
          response &&
          response.response &&
          response.response.businessEntity202001 &&
          !response.response.exception;
        break;
      case 'nzbn':
        response = await getEntityDetailsByNZBN({
          searchString: 9429040933108,
        });
        areCredentialsValid = true;
        break;
      case 'illion':
        response = await fetchCreditReportInPDFFormat({
          productCode: 'HXBCA',
          searchValue: 51069691676,
          searchField: 'ABN',
          countryCode: 'AUS',
        });
        areCredentialsValid =
          response?.Status && !response.Status.Error && response.Status.Success;
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    if (areCredentialsValid) {
      res.status(200).send({
        status: 'SUCCESS',
        message: 'Credentials tested successfully',
      });
    } else {
      res.status(400).send({ status: 'SUCCESS', message: 'Wrong credentials' });
    }
  } catch (e) {
    Logger.log.error(
      `Error occurred in testing ${req.query.apiName} credentials`,
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Wrong credentials.',
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
      await addAuditLog({
        entityType: 'document-type',
        entityRefId: document._id,
        actionType: 'add',
        userType: 'user',
        userRefId: req.user._id,
        logDescription: `A document type is successfully added by ${req.user.name}`,
      });
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
    Logger.log.warn('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
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
    if (
      document &&
      document._id.toString() !== req.params.documentId.toString()
    ) {
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
      const document = await DocumentType.findOne({
        _id: req.params.documentId,
      }).lean();
      if (document) {
        await addAuditLog({
          entityType: 'document-type',
          entityRefId: document?._id,
          actionType: 'edit',
          userType: 'user',
          userRefId: req.user._id,
          logDescription: `A document type is successfully updated by ${req.user.name}`,
        });
        res.status(200).send({
          status: 'SUCCESS',
          message: 'Document type updated successfully',
        });
      }
    }
  } catch (e) {
    Logger.log.error('Error occurred in update document types ', e);
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
      case 'nzbn':
        if (!req.body.accessToken) {
          return res.status(400).send({
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing.',
          });
        }
        update = { 'integration.nzbn.accessToken': req.body.accessToken };
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
    })
      .select({ integration: 1 })
      .lean();
    res.status(200).send({
      status: 'SUCCESS',
      data: organization,
      message: 'Credentials updated successfully',
    });
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
    const document = await DocumentType.findOne({
      _id: req.params.documentId,
    }).lean();
    await addAuditLog({
      entityType: 'document-type',
      entityRefId: document._id,
      actionType: 'delete',
      userType: 'user',
      userRefId: req.user._id,
      logDescription: `A document type is successfully deleted by ${req.user.name}`,
    });
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
