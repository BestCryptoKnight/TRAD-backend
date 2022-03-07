/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Policy = mongoose.model('policy');
const Insurer = mongoose.model('insurer');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getClientPolicies } = require('./../helper/rss.helper');
const {
  addAuditLog,
  getRegexForSearch,
} = require('./../helper/audit-log.helper');
const { getPolicyDetails } = require('./../helper/policy.helper');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  if (!req.query.columnFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require field is missing',
    });
  }
  try {
    const module = StaticFile.modules.find(
      (i) => i.name === req.query.columnFor,
    );
    const policyColumn = req.user.manageColumns.find(
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
        policyColumn &&
        policyColumn.columns.includes(module.manageColumns[i].name)
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
      'Error occurred in get debtor column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Details of Client Policy For Modal
 */
router.get('/client/policy-details/:policyId', async function (req, res) {
  if (
    !req.params.policyId ||
    !mongoose.Types.ObjectId.isValid(req.params.policyId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const policyData = await Policy.findById(req.params.policyId)
      .populate({ path: 'insurerId clientId', select: 'name' })
      .select({ __v: 0 })
      .lean();
    const response = await getPolicyDetails({ policyData });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Policy Details' },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Policy Details For Modal
 */
router.get('/details/:policyId', async function (req, res) {
  if (
    !req.params.policyId ||
    !mongoose.Types.ObjectId.isValid(req.params.policyId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const policyData = await Policy.findById(req.params.policyId)
      .populate({ path: 'insurerId clientId', select: 'name' })
      .select({ __v: 0, isDeleted: false, crmPolicyId: 0 })
      .lean();
    const response = await getPolicyDetails({ policyData });
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Policy Details' },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * List Insurer/Client Policies
 */
router.get('/:entityId', async function (req, res) {
  if (!req.params.entityId || !req.query.listFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'insurer-policy':
        queryFilter.insurerId = req.params.entityId;
        break;
      case 'client-policy':
        queryFilter.clientId = req.params.entityId;
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const policyColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    let sortingOptions = {};
    req.query.sortBy = req.query.sortBy || 'expiryDate';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder;
    if (req.query.search) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          {
            product: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
          {
            policyPeriod: {
              $regex: getRegexForSearch(req.query.search),
              $options: 'i',
            },
          },
        ],
      });
    }
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    if (policyColumn.columns.includes('insurerId')) {
      option.populate = 'insurerId';
    }
    if (policyColumn.columns.includes('clientId')) {
      option.populate += ' clientId';
    }
    option.select = policyColumn.columns.toString().replace(/,/g, ' ');
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await Policy.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (policyColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    responseObj.docs.forEach((data) => {
      if (data.policyNumber) {
        data.policyNumber = {
          id: data._id,
          value: data.policyNumber,
        };
      }
      if (policyColumn.columns.includes('insurerId')) {
        data.insurerId =
          data.insurerId && data.insurerId.name ? data.insurerId.name : '';
      }
      if (policyColumn.columns.includes('clientId')) {
        data.clientId =
          data.clientId && data.clientId.name ? data.clientId.name : '';
      }
      delete data.id;
    });
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error('Error occurred in get insurer list ', e.message || e);
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
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    Logger.log.warn('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    let module;
    switch (req.body.columnFor) {
      // case 'insurer-matrix':
      case 'insurer-policy':
      case 'client-policy':
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
 * Sync Policies from RSS - Update
 */
router.put('/sync-from-crm/:insurerId', async function (req, res) {
  if (
    !req.params.insurerId ||
    !mongoose.Types.ObjectId.isValid(req.params.insurerId) ||
    !req.body.clientIds ||
    req.body.clientIds.length === 0
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const [clients, insurer] = await Promise.all([
      Client.find({ _id: { $in: req.body.clientIds } })
        .select('_id name crmClientId')
        .lean(),
      Insurer.findOne({ _id: req.params.insurerId }).lean(),
    ]);
    if (!clients || clients.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'CLIENT_NOT_FOUND',
        message: 'Client(s) not found',
      });
    }
    let policiesFromCrm;
    let promiseArr = [];
    let newPolicies = [];
    for (let i = 0; i < clients.length; i++) {
      policiesFromCrm = await getClientPolicies({
        clientId: clients[i]._id,
        crmClientId: clients[i].crmClientId,
        insurerId: req.params.insurerId,
        page: 1,
        limit: 50,
      });
      for (let j = 0; j < policiesFromCrm.length; j++) {
        promiseArr.push(
          Policy.updateOne(
            { crmPolicyId: policiesFromCrm[j].crmPolicyId, isDeleted: false },
            policiesFromCrm[j],
            { upsert: true, setDefaultsOnInsert: true },
          ),
        );
        const policy = await Policy.findOne({
          crmPolicyId: policiesFromCrm[j].crmPolicyId,
          isDeleted: false,
        }).lean();
        if (policy && policy._id) {
          promiseArr.push(
            addAuditLog({
              entityType: 'policy',
              entityRefId: policy._id,
              userType: 'user',
              userRefId: req.user._id,
              actionType: 'sync',
              logDescription: `Insurer ${insurer.name} and client ${clients[i].name} policy no. ${policiesFromCrm[j].policyNumber} synced by ${req.user.name}`,
            }),
          );
        } else {
          newPolicies.push(policiesFromCrm[j].crmPolicyId);
        }
      }
    }
    await Promise.all(promiseArr);
    let promises = [];
    if (newPolicies.length !== 0) {
      const policyData = await Policy.find({
        crmPolicyId: { $in: newPolicies },
      })
        .populate({
          path: 'clientId',
          select: 'name',
        })
        .select('_id product clientId policyNumber')
        .lean();
      for (let i = 0; i < policyData.length; i++) {
        promises.push(
          addAuditLog({
            entityType: 'policy',
            entityRefId: policyData[i]._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Insurer ${insurer.name} and client ${policyData[i].clientId.name} policy no. ${policyData[i].policyNumber} synced by ${req.user.name}`,
          }),
        );
      }
    }
    await Promise.all(promises);
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Policies synced successfully' });
  } catch (e) {
    Logger.log.error('Error occurred in sync insurer policies ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Sync Clients Policies from RSS - Update
 */
router.put('/client/sync-from-crm/:clientId', async function (req, res) {
  if (
    !req.params.clientId ||
    !mongoose.Types.ObjectId.isValid(req.params.clientId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const client = await Client.findOne({ _id: req.params.clientId })
      .select('_id name crmClientId insurerId')
      .lean();
    let promiseArr = [];
    let newPolicies = [];
    if (client && client._id && client.insurerId) {
      const policiesFromCrm = await getClientPolicies({
        clientId: client._id,
        crmClientId: client.crmClientId,
        insurerId: client.insurerId,
        limit: 50,
        page: 1,
      });
      for (let j = 0; j < policiesFromCrm.length; j++) {
        promiseArr.push(
          Policy.updateOne(
            { crmPolicyId: policiesFromCrm[j].crmPolicyId, isDeleted: false },
            policiesFromCrm[j],
            { upsert: true, setDefaultsOnInsert: true },
          ),
        );
        const policy = await Policy.findOne({
          crmPolicyId: policiesFromCrm[j].crmPolicyId,
          isDeleted: false,
        }).lean();
        if (policy && policy._id) {
          promiseArr.push(
            addAuditLog({
              entityType: 'policy',
              entityRefId: policy._id,
              userType: 'user',
              userRefId: req.user._id,
              actionType: 'sync',
              logDescription: `Client ${client.name} policy no. ${policiesFromCrm[j].policyNumber} synced by ${req.user.name}`,
            }),
          );
        } else {
          newPolicies.push(policiesFromCrm[j].crmPolicyId);
        }
      }
      await Promise.all(promiseArr);
    }
    let promises = [];
    if (newPolicies.length !== 0) {
      const policyData = await Policy.find({
        crmPolicyId: { $in: newPolicies },
      }).lean();
      for (let i = 0; i < policyData.length; i++) {
        promises.push(
          addAuditLog({
            entityType: 'policy',
            entityRefId: policyData[i]._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Client ${client.name} policy no. ${policyData[i].policyNumber} synced by ${req.user.name}`,
          }),
        );
      }
    }
    res
      .status(200)
      .send({ status: 'SUCCESS', message: 'Policies synced successfully' });
  } catch (e) {
    Logger.log.error(
      'Error occurred in sync insurer contacts ',
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
