/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
} = require('./../helper/application.helper');

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
    const applicationColumn = req.user.manageColumns.find(
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
      if (applicationColumn.columns.includes(module.manageColumns[i].name)) {
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
      'Error occurred in get application column names',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get List
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'application',
    );
    const clients = await Client.find({
      isDeleted: false,
      $or: [
        { riskAnalystId: req.user._id },
        { serviceManagerId: req.user._id },
      ],
    })
      .select({ _id: 1 })
      .lean();
    const clientIds = clients.map((i) => i._id);
    let queryFilter = {
      isDeleted: false,
    };
    if (req.query.search) {
      queryFilter.applicationId = { $regex: `${req.query.search}` };
    }
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      queryFilter = {
        isDeleted: false,
        clientId: { $in: clientIds },
      };
    }
    if (req.query.status) {
      queryFilter.status = req.query.status;
    }

    let aggregationQuery = [];
    let sortingOptions = {};
    if (req.query.clientId || applicationColumn.columns.includes('clientId')) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $unwind: {
            path: '$clientId',
          },
        },
      );
    }
    if (req.query.clientId) {
      aggregationQuery.push({
        $match: {
          'clientId.name': req.query.clientId,
        },
      });
    }
    if (
      req.query.debtorId ||
      applicationColumn.columns.includes('debtorId') ||
      applicationColumn.columns.includes('entityType') ||
      req.query.entityType
    ) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $unwind: {
            path: '$debtorId',
          },
        },
      );
    }

    if (req.query.debtorId) {
      aggregationQuery.push({
        $match: {
          'debtorId.name': req.query.debtorId,
        },
      });
    }
    if (req.query.entityType) {
      aggregationQuery.push({
        $match: {
          'debtorId.entityType': req.query.entityType,
        },
      });
    }

    if (
      req.query.clientDebtorId ||
      applicationColumn.columns.includes('clientDebtorId')
    ) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'client-debtors',
            localField: 'clientDebtorId',
            foreignField: '_id',
            as: 'clientDebtorId',
          },
        },
        {
          $unwind: {
            path: '$clientDebtorId',
          },
        },
      );
    }

    if (req.query.clientDebtorId) {
      aggregationQuery.push({
        $match: {
          'clientDebtorId.creditLimit': req.query.clientDebtorId,
        },
      });
    }

    const fields = applicationColumn.columns.map((i) => {
      if (i === 'clientId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'clientDebtorId') {
        i = i + '.creditLimit';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (req.query.sortBy && req.query.sortOrder) {
      if (req.query.sortBy === 'clientId') {
        req.query.sortBy = req.query.sortBy + '.name';
      }
      if (req.query.sortBy === 'debtorId') {
        req.query.sortBy = req.query.sortBy + '.entityName';
      }
      if (req.query.sortBy === 'clientDebtorId') {
        req.query.sortBy = req.query.sortBy + '.creditLimit';
      }
      if (req.query.sortBy === 'entityType') {
        req.query.sortBy = 'debtorId.' + req.query.sortBy;
      }
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    aggregationQuery.push({
      $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
    });
    aggregationQuery.push({ $limit: parseInt(req.query.limit) });

    aggregationQuery.unshift({ $match: queryFilter });

    const [applications, total] = await Promise.all([
      Application.aggregate(aggregationQuery).allowDiskUse(true),
      Application.countDocuments(queryFilter).lean(),
    ]);
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (applicationColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (applications && applications.length !== 0) {
      applications.forEach((application) => {
        if (applicationColumn.columns.includes('entityType')) {
          application.entityType = application.debtorId.entityType;
        }
        if (applicationColumn.columns.includes('clientId')) {
          application.clientId = application.clientId.name;
        }
        if (applicationColumn.columns.includes('debtorId')) {
          application.debtorId = application.debtorId.entityName;
        }
        if (applicationColumn.columns.includes('clientDebtorId')) {
          application.clientDebtorId = application.clientDebtorId.creditLimit;
        }
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: applications,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
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
 * Get Specific Entity's Application
 */
router.get('/:entityId', async function (req, res) {
  if (
    !req.params.entityId ||
    !req.query.listFor ||
    !mongoose.Types.ObjectId.isValid(req.params.entityId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let queryFilter = {
      isDeleted: false,
    };
    switch (req.query.listFor) {
      case 'client-application':
        queryFilter.clientId = mongoose.Types.ObjectId(req.params.entityId);
        break;
      case 'debtor-application':
        queryFilter.debtorId = mongoose.Types.ObjectId(req.params.entityId);
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    const module = StaticFile.modules.find((i) => i.name === req.query.listFor);
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.listFor,
    );
    let aggregationQuery = [];
    let sortingOptions = {};
    if (applicationColumn.columns.includes('clientId')) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'clients',
            localField: 'clientId',
            foreignField: '_id',
            as: 'clientId',
          },
        },
        {
          $unwind: {
            path: '$clientId',
          },
        },
      );
    }
    if (
      applicationColumn.columns.includes('debtorId') ||
      applicationColumn.columns.includes('entityType')
    ) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'debtors',
            localField: 'debtorId',
            foreignField: '_id',
            as: 'debtorId',
          },
        },
        {
          $unwind: {
            path: '$debtorId',
          },
        },
      );
    }
    if (applicationColumn.columns.includes('clientDebtorId')) {
      aggregationQuery.push(
        {
          $lookup: {
            from: 'client-debtors',
            localField: 'clientDebtorId',
            foreignField: '_id',
            as: 'clientDebtorId',
          },
        },
        {
          $unwind: {
            path: '$clientDebtorId',
          },
        },
      );
    }

    const fields = applicationColumn.columns.map((i) => {
      if (i === 'clientId') {
        i = i + '.name';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'clientDebtorId') {
        i = i + '.creditLimit';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });
    if (req.query.sortBy && req.query.sortOrder) {
      if (req.query.sortBy === 'clientId') {
        req.query.sortBy = req.query.sortBy + '.name';
      }
      if (req.query.sortBy === 'debtorId') {
        req.query.sortBy = req.query.sortBy + '.entityName';
      }
      if (req.query.sortBy === 'clientDebtorId') {
        req.query.sortBy = req.query.sortBy + '.creditLimit';
      }
      if (req.query.sortBy === 'entityType') {
        req.query.sortBy = 'debtorId.' + req.query.sortBy;
      }
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }

    aggregationQuery.push({
      $skip: (parseInt(req.query.page) - 1) * parseInt(req.query.limit),
    });
    aggregationQuery.push({ $limit: parseInt(req.query.limit) });

    aggregationQuery.unshift({ $match: queryFilter });

    console.log('aggregationQuery : ', aggregationQuery);

    const [applications, total] = await Promise.all([
      Application.aggregate(aggregationQuery).allowDiskUse(true),
      Application.countDocuments(queryFilter).lean(),
    ]);

    console.log('applications : ', applications);
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (applicationColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    if (applications && applications.length !== 0) {
      applications.forEach((application) => {
        if (applicationColumn.columns.includes('entityType')) {
          application.entityType = application.debtorId.entityType;
        }
        if (applicationColumn.columns.includes('clientId')) {
          application.clientId = application.clientId.name;
        }
        if (applicationColumn.columns.includes('debtorId')) {
          application.debtorId = application.debtorId.entityName;
        }
        if (applicationColumn.columns.includes('clientDebtorId')) {
          application.clientDebtorId = application.clientDebtorId.creditLimit;
        }
      });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: applications,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred while getting specific entity applications ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Search from ABN/ACN Number
 */
router.get('/search-entity/:searchString', async function (req, res) {
  if (!req.params.searchString) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'SEARCH_STRING_NOT_FOUND',
      message: 'Please enter search string.',
    });
  }
  try {
    let entityData;
    if (req.params.searchString.length < 10) {
      console.log('Get entity details from ACN number :: ');
      entityData = await getEntityDetailsByACN({
        searchString: req.params.searchString,
      });
    } else {
      entityData = await getEntityDetailsByABN({
        searchString: req.params.searchString,
      });
    }
    let response = [];
    entityData[0].elements.forEach((data) => {
      console.log('Data : ', data);
      if (data.name === 'response') {
        data.elements.forEach((i) => {
          if (
            i.name === 'businessEntity202001' ||
            i.name === 'businessEntity201408'
          ) {
            let data = {};
            i.elements.forEach((j) => {
              if (j.name === 'ABN') {
                j.elements.forEach((k) => {
                  if (k.name === 'identifierValue') {
                    data['abnNumber'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'entityStatus') {
                j.elements.forEach((k) => {
                  if (k.name === 'entityStatusCode') {
                    data['status'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'ASICNumber') {
                data['acnNumber'] = j.elements[0]['text'];
              } else if (j.name === 'entityType') {
                j.elements.forEach((k) => {
                  if (k.name === 'entityDescription') {
                    data['entityType'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'goodsAndServicesTax') {
                j.elements.forEach((k) => {
                  if (k.name === 'effectiveFrom') {
                    data['gstStatus'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'mainName') {
                j.elements.forEach((k) => {
                  if (k.name === 'organisationName') {
                    data['companyName'] = k.elements[0]['text'];
                  } else if (k.name === 'effectiveFrom') {
                    data['registeredDate'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'mainTradingName') {
                j.elements.forEach((k) => {
                  if (k.name === 'organisationName') {
                    data['tradingName'] = k.elements[0]['text'];
                  }
                });
              } else if (j.name === 'mainBusinessPhysicalAddress') {
                j.elements.forEach((k) => {
                  if (k.name === 'stateCode') {
                    data['state'] = k.elements[0]['text'];
                  } else if (k.name === 'postcode') {
                    data['postcode'] = k.elements[0]['text'];
                  }
                });
              }
            });
            response.push(data);
          }
        });
      }
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error('Error occurred in search by ABN number  ', e);
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
      case 'application':
      case 'client-application':
      case 'debtor-application':
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
 * Delete Application
 */
router.delete('/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    await Application.updateOne(
      { _id: req.params.applicationId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Application deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete application ', e.message || e);
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
