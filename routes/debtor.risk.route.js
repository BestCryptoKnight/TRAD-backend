/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');

/**
 * Get Column Names
 */
router.get('/column-name', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor',
    );
    const customFields = [];
    const defaultFields = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
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
 * Get Entity Type List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        streetType: StaticData.streetType,
        australianStates: StaticData.australianStates,
        entityType: StaticData.entityType,
      },
    });
  } catch (e) {
    Logger.log.error('Error occurred in get entity type list', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor list
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor',
    );
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    let queryFilter = {
      isActive: true,
    };
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
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
      const clientDebtor = await ClientDebtor.find({
        clientId: { $in: clientIds },
      })
        .select('_id')
        .lean();
      const debtorIds = clientDebtor.map((i) => i._id);
      queryFilter = {
        isDeleted: false,
        _id: { $in: debtorIds },
      };
    }

    let sortingOptions = {};
    if (req.query.entityType) {
      queryFilter.entityType = req.query.entityType;
    }
    if (req.query.sortBy && req.query.sortOrder) {
      const addressFields = [
        'fullAddress',
        'property',
        'unitNumber',
        'streetNumber',
        'streetName',
        'streetType',
        'suburb',
        'state',
        'country',
        'postCode',
      ];
      if (addressFields.includes(req.query.sortBy)) {
        req.query.sortBy = 'address.' + req.query.sortBy;
      }
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
    }
    if (req.query.search)
      queryFilter.entityName = { $regex: req.query.search, $options: 'i' };
    let option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select =
      debtorColumn.columns.toString().replace(/,/g, ' ') + ' address';
    option.sort = sortingOptions;
    option.lean = true;
    let responseObj = await Debtor.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    responseObj.docs.forEach((debtor) => {
      if (debtorColumn.columns.includes('fullAddress')) {
        debtor.fullAddress = Object.values(debtor.address)
          .toString()
          .replace(/,,/g, ',');
      }
      if (debtorColumn.columns.includes('property')) {
        debtor.property = debtor.address.property;
      }
      if (debtorColumn.columns.includes('unitNumber')) {
        debtor.unitNumber = debtor.address.unitNumber;
      }
      if (debtorColumn.columns.includes('streetNumber')) {
        debtor.streetNumber = debtor.address.streetNumber;
      }
      if (debtorColumn.columns.includes('streetName')) {
        debtor.streetName = debtor.address.streetName;
      }
      if (debtorColumn.columns.includes('streetType')) {
        debtor.streetType = debtor.address.streetType;
      }
      if (debtorColumn.columns.includes('suburb')) {
        debtor.suburb = debtor.address.suburb;
      }
      if (debtorColumn.columns.includes('state')) {
        debtor.state = debtor.address.state;
      }
      if (debtorColumn.columns.includes('country')) {
        debtor.country = debtor.address.country;
      }
      if (debtorColumn.columns.includes('postCode')) {
        debtor.postCode = debtor.address.postCode;
      }
      if (debtor.entityType) {
        debtor.entityType = debtor.entityType
          .replace(/_/g, ' ')
          .replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          });
      }
      delete debtor.address;
      delete debtor.id;
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: responseObj,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get debtor list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Modal details
 */
router.get('/drawer-details/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const module = StaticFile.modules.find((i) => i.name === 'debtor');
    const debtor = await ClientDebtor.findOne({
      _id: req.params.debtorId,
    })
      .populate({
        path: 'debtorId',
        select: { _id: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 },
      })
      .select({ _id: 0, isDeleted: 0, clientId: 0, __v: 0 })
      .lean();
    let response = [];
    let value = '';
    module.manageColumns.forEach((i) => {
      value =
        i.name === 'creditLimit' ||
        i.name === 'createdAt' ||
        i.name === 'updatedAt'
          ? debtor[i.name]
          : debtor['debtorId'][i.name];
      response.push({
        label: i.label,
        value: value || '',
        type: i.type,
      });
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get debtor modal details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Details
 */
router.get('/details/:debtorId', async function (req, res) {
  if (!req.params.debtorId || !req.query.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findOne({
      debtorId: req.params.debtorId,
      clientId: req.query.clientId,
      status: { $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'] },
    }).lean();
    if (application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'APPLICATION_ALREADY_EXISTS',
        message: 'Application already exists.',
      });
    }
    const debtor = await Debtor.findById(req.params.debtorId)
      .select({ isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    if (debtor) {
      if (debtor.address) {
        for (let key in debtor.address) {
          debtor[key] = debtor.address[key];
        }
        delete debtor.address;
      }
      if (debtor.entityType) {
        debtor.entityType = [
          {
            label: debtor.entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              }),
            value: debtor.entityType,
          },
        ];
      }
      if (debtor.entityName) {
        debtor.entityName = [
          {
            label: debtor.entityName,
            value: debtor.entityName,
          },
        ];
      }
      if (debtor.state) {
        const state = StaticData.australianStates.find((i) => {
          if (i._id === debtor.state) return i;
        });
        if (state) {
          debtor.state = [
            {
              label: state.name,
              value: debtor.state,
            },
          ];
        }
      }
      if (debtor.streetType) {
        const streetType = StaticData.streetType.find((i) => {
          if (i._id === debtor.streetType) return i;
        });
        if (streetType) {
          debtor.streetType = [
            {
              label: streetType.name,
              value: debtor.streetType,
            },
          ];
        }
      }
    }
    res.status(200).send({ status: 'SUCCESS', data: debtor });
  } catch (e) {
    Logger.log.error('Error occurred in get debtor details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Debtor Credit-Limit
 */
router.get('/credit-limit/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let queryFilter = {
      isActive: true,
      debtorId: mongoose.Types.ObjectId(req.params.debtorId),
    };
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
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
      queryFilter.clientId = { $in: clientIds };
    }
    const aggregationQuery = [
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
    ];
    aggregationQuery.push({
      $project: {
        'clientId._id': 1,
        'clientId.name': 1,
        'clientId.contactNumber': 1,
        'clientId.abn': 1,
        'clientId.acn': 1,
        'clientId.inceptionDate': 1,
        'clientId.expiryDate': 1,
        creditLimit: 1,
      },
    });
    const sortingOptions = {};
    if (req.query.sortBy && req.query.sortOrder) {
      sortingOptions[req.query.sortBy] =
        req.query.sortOrder === 'desc' ? -1 : 1;
      aggregationQuery.push({ $sort: sortingOptions });
    }
    if (req.query.search) {
      aggregationQuery.push({
        $match: {
          'clientId.name': { $regex: req.query.search, $options: 'i' },
        },
      });
    }
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
    aggregationQuery.unshift({ $match: queryFilter });

    const debtors = await ClientDebtor.aggregate(aggregationQuery).allowDiskUse(
      true,
    );
    const headers = [
      {
        name: 'clientId',
        label: 'Client Name',
        type: 'modal',
        request: { method: 'GET', url: 'client/details' },
      },
      { name: 'contactNumber', label: 'Contact Number', type: 'string' },
      { name: 'abn', label: 'ABN', type: 'string' },
      { name: 'acn', label: 'ACN', type: 'string' },
      { name: 'inceptionDate', label: 'Inception Date', type: 'date' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
      { name: 'creditLimit', label: 'Credit Limit', type: 'string' },
    ];
    debtors[0].paginatedResult.forEach((debtor) => {
      if (debtor.clientId.name) {
        debtor.name = {
          id: debtor.clientId._id,
          value: debtor.clientId.name,
        };
      }
      if (debtor.clientId.contactNumber) {
        debtor.contactNumber = debtor.clientId.contactNumber;
      }
      if (debtor.clientId.abn) {
        debtor.abn = debtor.clientId.abn;
      }
      if (debtor.clientId.acn) {
        debtor.acn = debtor.clientId.acn;
      }
      if (debtor.clientId.inceptionDate) {
        debtor.inceptionDate = debtor.clientId.inceptionDate;
      }
      if (debtor.clientId.expiryDate) {
        debtor.expiryDate = debtor.clientId.expiryDate;
      }
      delete debtor.clientId;
    });
    const total =
      debtors[0]['totalCount'].length !== 0
        ? debtors[0]['totalCount'][0]['count']
        : 0;
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        docs: debtors[0].paginatedResult,
        headers,
        total,
        page: parseInt(req.query.page),
        limit: parseInt(req.query.limit),
        pages: Math.ceil(total / parseInt(req.query.limit)),
      },
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Client-Debtor Details
 */
router.get('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findById(req.params.debtorId)
      .select({ isDeleted: 0, __v: 0 })
      .lean();
    if (debtor && debtor.entityType) {
      debtor.entityType = debtor.entityType
        .replace(/_/g, ' ')
        .replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: debtor,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
      e.message || e,
    );
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
      message: 'Please first login to update the profile.',
    });
  }
  if (!req.body.hasOwnProperty('isReset') || !req.body.columns) {
    Logger.log.error('Require fields are missing');
    return res.status(400).send({
      status: 'ERROR',
      message: 'Something went wrong, please try again.',
    });
  }
  try {
    let updateColumns = [];
    if (req.body.isReset) {
      const module = StaticFile.modules.find((i) => i.name === 'debtor');
      updateColumns = module.defaultColumns;
    } else {
      updateColumns = req.body.columns;
    }
    await User.updateOne(
      { _id: req.user._id, 'manageColumns.moduleName': 'debtor' },
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
 * Update client-debtor status
 */
router.put('/', async function (req, res) {
  if (!req.body.debtorIds || req.body.debtorIds.length === 0) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await ClientDebtor.update(
      { _id: { $in: req.body.debtorIds } },
      { isActive: false },
      { multi: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update debtor status ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Debtor Details
 */
router.put('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const update = {};
    if (req.body.address && Object.keys(req.body.address).length !== 0) {
      update.address = {
        property: req.body.address.property,
        unitNumber: req.body.address.unitNumber,
        streetNumber: req.body.address.streetNumber,
        streetName: req.body.address.streetName,
        streetType: req.body.address.streetType,
        suburb: req.body.address.suburb,
        state: req.body.address.state,
        country: req.body.address.country,
        postCode: req.body.address.postCode,
      };
    }
    if (req.body.entityType) update.entityType = req.body.entityType;
    if (req.body.contactNumber) update.contactNumber = req.body.contactNumber;
    if (req.body.tradingName) update.tradingName = req.body.tradingName;
    if (req.body.entityName) update.entityName = req.body.entityName;
    if (req.body.acn) update.acn = req.body.acn;
    if (req.body.abn) update.abn = req.body.abn;
    await Debtor.updateOne({ _id: req.params.debtorId }, update);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors details updated successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in update debtor details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Delete Client-Debtor
 */
router.delete('/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await ClientDebtor.updateOne(
      { _id: req.params.debtorId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Debtors deleted successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in delete client-debtor ', e.message || e);
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
