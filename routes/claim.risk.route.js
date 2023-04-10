/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  getClaimsList,
  addClaimInRSS,
  listDocuments,
  uploadDocumentInRSS,
} = require('./../helper/claims.helper');
const { getClientList } = require('./../helper/client.helper');
const {
  getClaimById,
  downloadDocument,
  getClaimsManagerList,
} = require('./../helper/rss.helper');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Get RSS Users
 */
router.get('/rss-users', async function (req, res) {
  try {
    let claimManagerList = await getClaimsManagerList(1, 100);
    let result = [];
    claimManagerList.list.forEach((v) => {
      result.push({
        value: v.record.id,
        label: v.record.first + ' ' + v.record.last,
      });
    });
    res.send({ data: result, status: 'SUCCESS' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in while getting RSS Users',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

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
    const claimColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
    let customFields = [];
    let defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (
        claimColumn &&
        claimColumn.columns.includes(module.manageColumns[i].name)
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
      'Error occurred in get claim column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Entity List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const clients = await getClientList({
      hasFullAccess: hasFullAccess,
      userId: req.user._id,
      sendCRMIds: true,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: clients,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get entity list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get claim list
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'claim');
    const claimColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'claim',
    );
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const clientModuleAccess = req.user.moduleAccess
      .filter((userModule) => userModule.name === 'client')
      .shift();
    const hasOnlyReadAccessForClientModule =
      clientModuleAccess.accessTypes.length === 0;

    const response = await getClaimsList({
      claimColumn: claimColumn.columns,
      requestedQuery: req.query,
      userId: req.user._id,
      hasFullAccess,
      moduleColumn: module.manageColumns,
      hasOnlyReadAccessForClientModule,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Claim Specific Documents
 */
router.get('/document/download/:entityId', async function (req, res) {
  if (!req.params.entityId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const { data, headers } = await downloadDocument({
      documentId: req.params.entityId,
    });
    res.setHeader('Content-Type', headers?.['content-type']);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' +
        headers?.['content-disposition']
          ?.split('filename=')[1]
          .replace(/['"]+/g, ''),
    );
    return data.pipe(res);
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting specific entity claims ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Claim Specific Documents
 */
router.get('/document/:entityId', async function (req, res) {
  if (!req.params.entityId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const response = await listDocuments({
      crmId: req.params.entityId,
      requestedQuery: req.query,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting specific entity claims ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Claim Detail
 */
router.get('/:entityId', async function (req, res) {
  if (!req.params.entityId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const claim = await getClaimById({ crmId: req.params.entityId });
    if (claim?.record) {
      const client = await Client.findOne({
        crmClientId: claim.record.accountid,
      })
        .select('name')
        .lean();
      claim.record.accountid = client?.name || '';
      claim.record.claimsinforequested =
        claim.record.claimsinforequested === '1';
      claim.record.claimsinforeviewed = claim.record.claimsinforeviewed === '1';
      claim.record.reimbursementrequired =
        claim.record.reimbursementrequired === '1';
      claim.record.tradinghistory = claim.record.tradinghistory === '1';
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: claim && claim.record ? claim.record : {},
    });
  } catch (e) {
    Logger.log.error('Error occurred while getting specific entity claims ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Add Claim in RSS
 */
router.post('/', async function (req, res) {
  if (
    !req.body ||
    !req.body.name ||
    !req.body.hasOwnProperty('claimsinforequested') ||
    !req.body.accountid
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const response = await addClaimInRSS({
      requestBody: req.body,
      userType: 'user',
      userId: req.user._id,
      userName: req.user.name,
      claimsManager: req.body.claimsManager,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Claim added successfully',
      claimId: response?.record?.id | '',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while adding claim in RSS',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Upload Document
 */
router.post('/document', upload.single('document'), async function (req, res) {
  req.body = JSON.parse(JSON.stringify(req.body));
  if (!req.body.parentId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing.',
    });
  }
  try {
    await uploadDocumentInRSS({
      parentId: req.body.parentId,
      parentObject: 'Claim',
      fileBuffer: req.file.buffer,
      fileName: req.file.originalname,
      description: req.body.description,
    });
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Document uploaded successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in upload document');
    Logger.log.error(e.message || e);
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
      message: 'Require fields are missing',
    });
  }
  try {
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      case 'claim':
      case 'client-claim':
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
 * Export Router
 */
module.exports = router;
