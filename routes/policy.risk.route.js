/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Policy = mongoose.model('policy');
const Insurer = mongoose.model('insurer');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const { getClientPolicies } = require('./../helper/rss.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

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
 * Get Details of Client Policy
 */
router.get('/client/policy-details/:policyId', async function (req, res) {
  if (!req.params.policyId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-policy');
    const policyData = await Policy.findById(req.params.policyId)
      .select({ __v: 0 })
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (policyData.hasOwnProperty(i.name)) {
        response.push({
          label: i.label,
          value: policyData[i.name] || '-',
          type: i.type,
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * List Client Policies
 */
router.get('/client/:clientId', async function (req, res) {
  if (!req.params.clientId) {
    Logger.log.error('Client id not found.');
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Please pass client id.',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'client-policy');
    const policyColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'client-policy',
    );
    let queryFilter = {
      isDeleted: false,
      clientId: req.params.clientId,
    };
    let sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
    if (req.query.search)
      queryFilter.name = { $regex: req.query.search, $options: 'i' };
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
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
      if (data.product) {
        data.product = {
          id: data._id,
          value: data.product,
        };
      }
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
 * Get Details of CI Policy
 */
router.get('/ci-details/:policyId', async function (req, res) {
  if (!req.params.policyId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'insurer-policy');
    const policyData = await Policy.findById(req.params.policyId)
      .select({ __v: 0 })
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (policyData.hasOwnProperty(i.name)) {
        response.push({
          label: i.label,
          value: policyData[i.name] || '-',
          type: i.type,
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Details of RMP Policy
 */
router.get('/rmp-details/:policyId', async function (req, res) {
  if (!req.params.policyId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'insurer-matrix');
    const policyData = await Policy.findById(req.params.policyId)
      .select({ __v: 0 })
      .lean();
    let response = [];
    module.manageColumns.forEach((i) => {
      if (policyData.hasOwnProperty(i.name)) {
        response.push({
          label: i.label,
          value: policyData[i.name] || '-',
          type: i.type,
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in get policy details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * List Insurer Policies
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
        queryFilter.product = { $regex: '.*Credit Insurance.*' };
        break;
      case 'insurer-matrix':
        queryFilter.insurerId = req.params.entityId;
        queryFilter.product = { $regex: '.*Risk Management Package.*' };
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
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] = req.query.sortOrder;
    }
    if (req.query.search)
      queryFilter.product = { $regex: req.query.search, $options: 'i' };
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
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
      if (data.product) {
        data.product = {
          id: data._id,
          value: data.product,
        };
      }
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
  if (!req.user || !req.user._id) {
    Logger.log.error('User data not found in req');
    return res.status(401).send({
      status: 'ERROR',
      messageCode: 'UNAUTHORIZED',
      message: 'Please first login to update columns.',
    });
  }
  if (
    !req.body.hasOwnProperty('isReset') ||
    !req.body.columns ||
    !req.body.columnFor
  ) {
    Logger.log.error('Require fields are missing');
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
      case 'insurer-policy':
      case 'insurer-matrix':
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
  if (!req.params.insurerId || !req.query.listFor) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    let query;
    switch (req.query.listFor) {
      case 'insurer-policy':
        query = { product: { $con: 'Credit Insurance' } };
        break;
      case 'insurer-matrix':
        query = { product: { $con: 'Risk Management Package' } };
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const [policies, insurer] = await Promise.all([
      Policy.aggregate([
        {
          $match: { insurerId: mongoose.Types.ObjectId(req.params.insurerId) },
        },
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        {
          $group: {
            _id: '$clientId',
            crmClientId: { $first: '$client.crmClientId' },
          },
        },
      ]).allowDiskUse(true),
      Insurer.findOne({ _id: req.params.insurerId }).lean(),
    ]);
    if (!policies || policies.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'POLICY_NOT_FOUND',
        message: 'Policies not found.',
      });
    }
    console.log('Total Clients : ', policies.length);
    let policiesFromCrm;
    let promiseArr = [];
    let newPolicies = [];
    const logDescription =
      req.query.listFor === 'insurer-policy' ? 'policy' : 'matrix';
    for (let i = 0; i < policies.length; i++) {
      policiesFromCrm = await getClientPolicies({
        clientId: policies[i]._id,
        crmClientId: policies[i].crmClientId[0],
        insurerId: req.params.insurerId,
        query: query,
      });
      for (let j = 0; j < policiesFromCrm.length; j++) {
        promiseArr.push(
          Policy.updateOne(
            { crmPolicyId: policiesFromCrm[j].crmPolicyId, isDeleted: false },
            policiesFromCrm[j],
            { upsert: true },
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
              logDescription: `Insurer ${insurer.name} ${logDescription} ${policiesFromCrm[j].product} synced successfully`,
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
      }).lean();
      for (let i = 0; i < policyData.length; i++) {
        promises.push(
          addAuditLog({
            entityType: 'policy',
            entityRefId: policyData[i]._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Insurer ${insurer.name} ${logDescription} ${policyData[i].product} synced successfully`,
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
  if (!req.params.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const policies = await Policy.aggregate([
      { $match: { clientId: mongoose.Types.ObjectId(req.params.clientId) } },
      {
        $lookup: {
          from: 'clients',
          localField: 'clientId',
          foreignField: '_id',
          as: 'client',
        },
      },
      {
        $group: {
          _id: '$clientId',
          clientName: { $first: '$client.name' },
          crmClientId: { $first: '$client.crmClientId' },
        },
      },
    ]).allowDiskUse(true);
    if (!policies || policies.length === 0) {
      Logger.log.error('No Policies found', req.params.insurerId);
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'POLICY_NOT_FOUND',
        message: 'Policies not found.',
      });
    }
    console.log('Total Policies : ', policies.length);
    let policiesFromCrm;
    let promiseArr = [];
    let newPolicies = [];
    for (let i = 0; i < policies.length; i++) {
      policiesFromCrm = await getClientPolicies({
        clientId: policies[i]._id,
        crmClientId: policies[i].crmClientId[0],
        insurerId: req.params.insurerId,
      });
      for (let j = 0; j < policiesFromCrm.length; j++) {
        promiseArr.push(
          Policy.updateOne(
            { crmPolicyId: policiesFromCrm[j].crmPolicyId, isDeleted: false },
            policiesFromCrm[j],
            { upsert: true },
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
              logDescription: `Insurer ${policies[i].clientName[0]} policy ${policiesFromCrm[j].product} synced successfully`,
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
      }).lean();
      for (let i = 0; i < policyData.length; i++) {
        promises.push(
          addAuditLog({
            entityType: 'policy',
            entityRefId: policyData[i]._id,
            userType: 'user',
            userRefId: req.user._id,
            actionType: 'sync',
            logDescription: `Insurer ${policies[0].clientName[0]} policy ${policyData[i].product} synced successfully`,
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
