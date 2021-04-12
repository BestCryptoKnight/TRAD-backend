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
const DebtorDirector = mongoose.model('debtor-director');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');
const { getClientDebtorDetails } = require('./../helper/client-debtor.helper');
const {
  getStakeholderDetails,
  storeStakeholderDetails,
} = require('./../helper/stakeholder.helper');
const { partnerDetailsValidation } = require('./../helper/application.helper');

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
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === req.query.columnFor,
    );
    if (!module || !module.manageColumns || module.manageColumns.length === 0) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'BAD_REQUEST',
        message: 'Please pass correct fields',
      });
    }
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
        newZealandStates: StaticData.newZealandStates,
        countryList: StaticData.countryList,
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
        debtor.country = debtor.address.country.name;
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
 * Get Stakeholder drawer details
 */
router.get(
  '/stakeholder/drawer-details/:stakeholderId',
  async function (req, res) {
    if (
      !req.params.stakeholderId ||
      !mongoose.Types.ObjectId.isValid(req.params.stakeholderId)
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'REQUIRE_FIELD_MISSING',
        message: 'Require fields are missing',
      });
    }
    try {
      let module = StaticFile.modules.find((i) => i.name === 'stakeholder');
      module = JSON.parse(JSON.stringify(module));
      const stakeholder = await DebtorDirector.findById(
        req.params.stakeholderId,
      )
        .select({ __v: 0, isDeleted: 0 })
        .lean();
      if (!stakeholder) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'NO_STAKEHOLDER_FOUND',
          message: 'No stakeholder found',
        });
      }
      const response = await getStakeholderDetails({
        stakeholder,
        manageColumns: module.manageColumns,
      });
      res.status(200).send({ status: 'SUCCESS', data: response });
    } catch (e) {
      Logger.log.error(
        'Error occurred in get stakeholder modal details ',
        e.message || e,
      );
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get Stakeholder details
 */
router.get('/stakeholder-details/:stakeholderId', async function (req, res) {
  if (
    !req.params.stakeholderId ||
    !mongoose.Types.ObjectId.isValid(req.params.stakeholderId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const stakeholder = await DebtorDirector.findById(req.params.stakeholderId)
      .select({ debtorId: 0, __v: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 })
      .lean();
    res.status(200).send({ status: 'SUCCESS', data: stakeholder });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get stakeholder details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get StakeHolder List
 */
router.get('/stakeholder/:debtorId', async function (req, res) {
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
    const module = StaticFile.modules.find((i) => i.name === 'stakeholder');
    const stakeholderColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'stakeholder',
    );
    if (stakeholderColumn.columns.includes('name')) {
      stakeholderColumn.columns.push('entityName');
      stakeholderColumn.columns.push('firstName');
      stakeholderColumn.columns.push('middleName');
      stakeholderColumn.columns.push('lastName');
    }
    const queryFilter = {
      isDeleted: false,
      debtorId: mongoose.Types.ObjectId(req.params.debtorId),
    };
    const sortingOptions = {};
    req.query.sortBy = req.query.sortBy || '_id';
    req.query.sortOrder = req.query.sortOrder || 'desc';
    sortingOptions[req.query.sortBy] = req.query.sortOrder;
    /* if (req.query.search)
      queryFilter.name = { $regex: req.query.search, $options: 'i' };*/

    const option = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 5,
    };
    option.select =
      stakeholderColumn.columns.toString().replace(/,/g, ' ') +
      ' residentialAddress type';
    option.sort = sortingOptions;
    option.lean = true;
    const responseObj = await DebtorDirector.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (stakeholderColumn.columns.includes(module.manageColumns[i].name)) {
        responseObj.headers.push(module.manageColumns[i]);
      }
    }
    if (responseObj && responseObj.docs && responseObj.docs.length !== 0) {
      responseObj.docs.forEach((stakeholder) => {
        if (stakeholder.type === 'individual') {
          if (
            stakeholder.firstName ||
            stakeholder.middleName ||
            stakeholder.lastName
          ) {
            stakeholder.name = {
              _id: stakeholder._id,
              value: (
                (stakeholder.firstName ? stakeholder.firstName + ' ' : '') +
                (stakeholder.middleName ? stakeholder.middleName + ' ' : '') +
                (stakeholder.lastName ? stakeholder.lastName : '')
              ).trim(),
            };
            delete stakeholder.firstName;
            delete stakeholder.middleName;
            delete stakeholder.lastName;
          }
          if (stakeholderColumn.columns.includes('fullAddress')) {
            stakeholder.fullAddress = Object.values(
              stakeholder.residentialAddress,
            )
              .toString()
              .replace(/,,/g, ',');
          }
          if (stakeholderColumn.columns.includes('property')) {
            stakeholder.property = stakeholder.residentialAddress.property;
          }
          if (stakeholderColumn.columns.includes('unitNumber')) {
            stakeholder.unitNumber = stakeholder.residentialAddress.unitNumber;
          }
          if (stakeholderColumn.columns.includes('streetNumber')) {
            stakeholder.streetNumber =
              stakeholder.residentialAddress.streetNumber;
          }
          if (stakeholderColumn.columns.includes('streetName')) {
            stakeholder.streetName = stakeholder.residentialAddress.streetName;
          }
          if (stakeholderColumn.columns.includes('streetType')) {
            const streetType = StaticData.streetType.find((i) => {
              if (i._id === stakeholder.residentialAddress.streetType) return i;
            });
            stakeholder.streetType =
              streetType && streetType.name
                ? streetType.name
                : stakeholder.residentialAddress.streetType;
          }
          if (stakeholderColumn.columns.includes('suburb')) {
            stakeholder.suburb = stakeholder.residentialAddress.suburb;
          }
          if (stakeholderColumn.columns.includes('state')) {
            stakeholder.state = stakeholder.residentialAddress.state;
          }
          if (stakeholderColumn.columns.includes('country')) {
            stakeholder.country = stakeholder.residentialAddress.country.name;
          }
          if (stakeholderColumn.columns.includes('postCode')) {
            stakeholder.postCode = stakeholder.residentialAddress.postCode;
          }
          delete stakeholder.residentialAddress;
        } else {
          if (stakeholder.entityName) {
            stakeholder.name = {
              _id: stakeholder._id,
              value: stakeholder.entityName,
            };
            delete stakeholder.entityName;
          }
          if (stakeholder.entityType) {
            stakeholder.entityType = stakeholder.entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              });
          }
        }
        delete stakeholder.type;
        delete stakeholder.id;
      });
    }
    res.status(200).send({ status: 'SUCCESS', data: responseObj });
  } catch (e) {
    Logger.log.error('Error occurred in get stakeholder list ', e.message || e);
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
    let module = StaticFile.modules.find((i) => i.name === 'debtor');
    module = JSON.parse(JSON.stringify(module));
    const debtor = await ClientDebtor.findOne({
      _id: req.params.debtorId,
    })
      .populate({
        path: 'debtorId',
        select: { _id: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 },
      })
      .select({ _id: 0, isDeleted: 0, clientId: 0, __v: 0 })
      .lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    const response = await getClientDebtorDetails({
      debtor,
      manageColumns: module.manageColumns,
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
 * Get Debtor Modal details
 */
router.get('/drawer/:debtorId', async function (req, res) {
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
    let module = StaticFile.modules.find((i) => i.name === 'debtor');
    module = JSON.parse(JSON.stringify(module));
    const debtor = await Debtor.findOne({
      _id: req.params.debtorId,
    })
      .select({ _id: 0, isDeleted: 0, createdAt: 0, updatedAt: 0 })
      .lean();
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    const response = await getClientDebtorDetails({
      debtor: { debtorId: debtor },
      manageColumns: module.manageColumns,
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
      if (debtor.country) {
        debtor.country = [
          {
            label: debtor.country.name,
            value: debtor.country.code,
          },
        ];
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
    const module = StaticFile.modules.find(
      (i) => i.name === 'debtor-credit-limit',
    );
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'debtor-credit-limit',
    );
    const queryFilter = {
      isActive: true,
      debtorId: mongoose.Types.ObjectId(req.params.debtorId),
    };
    const aggregationQuery = [];
    if (debtorColumn.columns.includes('clientId')) {
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
    const fields = debtorColumn.columns.map((i) => {
      if (
        i === 'contactNumber' ||
        i === 'abn' ||
        i === 'acn' ||
        i === 'inceptionDate' ||
        i === 'expiryDate'
      ) {
        i = 'clientId';
      }
      return [i, 1];
    });
    aggregationQuery.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
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
    const headers = [];
    for (let i = 0; i < module.manageColumns.length; i++) {
      if (debtorColumn.columns.includes(module.manageColumns[i].name)) {
        headers.push(module.manageColumns[i]);
      }
    }
    debtors[0].paginatedResult.forEach((debtor) => {
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
      if (debtor.hasOwnProperty('isActive')) {
        debtor.isActive = debtor.isActive ? 'Yes' : 'No';
      }
      if (debtor.clientId.name) {
        debtor.clientId = {
          id: debtor.clientId._id,
          value: debtor.clientId.name,
        };
      }
      if (!debtorColumn.columns.includes('clientId')) {
        delete debtor.clientId;
      }
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
    if (!debtor) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_DEBTOR_FOUND',
        message: 'No debtor found',
      });
    }
    if (debtor.entityType) {
      debtor.entityType = [
        {
          label: debtor.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: debtor.entityType,
        },
      ];
    }
    if (debtor.address) {
      for (let key in debtor.address) {
        debtor[key] = debtor.address[key];
      }
      if (debtor.state) {
        const state =
          debtor.country.code === 'AUS'
            ? StaticData.australianStates.find((i) => {
                if (i._id === debtor.state) return i;
              })
            : debtor.country.code === 'NZL'
            ? StaticData.newZealandStates.find((i) => {
                if (i._id === debtor.state) return i;
              })
            : { name: debtor.state };
        debtor.state = [
          {
            value: debtor.state,
            label: state && state.name ? state.name : debtor.state,
          },
        ];
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
      if (debtor.country) {
        debtor.country = [
          {
            label: debtor.country.name,
            value: debtor.country.code,
          },
        ];
      }
      delete debtor.address;
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
 * Add Stakeholder
 */
router.post('/stakeholder/:debtorId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId) ||
    !req.body.type
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.type === 'company' &&
    (!req.body.entityName ||
      !req.body.entityType ||
      (!req.body.abn && !req.body.acn))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'INSUFFICIENT_COMPANY_DETAILS',
      message: 'Insufficient company details',
    });
  }
  if (
    !req.body.title ||
    !req.body.firstName ||
    !req.body.lastName ||
    (!req.body.dateOfBirth && !req.body.driverLicenceNumber) ||
    !req.body.address ||
    !req.body.address.state ||
    !req.body.address.postCode ||
    !req.body.address.streetNumber
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'INSUFFICIENT_INDIVIDUAL_DETAILS',
      message: 'Insufficient individual details',
    });
  }
  try {
    const [debtor, stakeholders] = await Promise.all([
      Debtor.findById(req.params.debtorId).lean(),
      DebtorDirector.find({ debtorId: req.params.debtorId })
        .select('_id type')
        .lean(),
    ]);
    let individualCount = 0;
    let companyCount = 0;
    req.body.type === 'company' ? companyCount++ : individualCount++;
    stakeholders.forEach((data) =>
      data.type.toLowerCase() === 'company'
        ? companyCount++
        : individualCount++,
    );
    const isValidate = partnerDetailsValidation({
      entityType: debtor.entityType,
      individualCount,
      companyCount,
    });
    if (!isValidate) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_DATA',
        message: 'Insufficient stakeholder details',
      });
    }
    const data = await storeStakeholderDetails({
      stakeholder: req.body,
      debtorId: debtor._id,
    });
    const stakeholder = await DebtorDirector.create(data);
    console.log('stakeholder : ', stakeholder);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Stakeholder added successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in add stakeholder ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Update Stakeholder
 */
router.put('/stakeholder/:debtorId/:stakeholderId', async function (req, res) {
  if (
    !req.params.debtorId ||
    !mongoose.Types.ObjectId.isValid(req.params.debtorId) ||
    !req.params.stakeholderId ||
    !mongoose.Types.ObjectId.isValid(req.params.stakeholderId) ||
    !req.body.type
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.type === 'company' &&
    (!req.body.entityName ||
      !req.body.entityType ||
      (!req.body.abn && !req.body.acn))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'INSUFFICIENT_COMPANY_DETAILS',
      message: 'Insufficient company details',
    });
  }
  if (
    !req.body.title ||
    !req.body.firstName ||
    !req.body.lastName ||
    (!req.body.dateOfBirth && !req.body.driverLicenceNumber) ||
    !req.body.address ||
    !req.body.address.state ||
    !req.body.address.postCode ||
    !req.body.address.streetNumber
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'INSUFFICIENT_INDIVIDUAL_DETAILS',
      message: 'Insufficient individual details',
    });
  }
  try {
    const [debtor, stakeholders] = await Promise.all([
      Debtor.findById(req.params.debtorId).lean(),
      DebtorDirector.find({ debtorId: req.params.debtorId })
        .select('_id type')
        .lean(),
    ]);
    let individualCount = 0;
    let companyCount = 0;
    stakeholders.forEach((data) => {
      if (data._id.toString() === req.params.stakeholderId) {
        req.body.type.toLowerCase() === 'company'
          ? companyCount++
          : individualCount++;
      } else {
        data.type.toLowerCase() === 'company'
          ? companyCount++
          : individualCount++;
      }
    });
    const isValidate = partnerDetailsValidation({
      entityType: debtor.entityType,
      individualCount,
      companyCount,
    });
    if (!isValidate) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_DATA',
        message: 'Insufficient stakeholder details',
      });
    }
    const update = await storeStakeholderDetails({
      stakeholder: req.body,
      debtorId: debtor._id,
    });
    await DebtorDirector.updateOne({ _id: req.params.stakeholderId }, update);
    console.log('stakeholder : ', update);
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Stakeholder added successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in add stakeholder ', e.message || e);
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
      case 'debtor':
      case 'debtor-credit-limit':
      case 'stakeholder':
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
router.delete('/stakeholder/:stakeholderId', async function (req, res) {
  if (
    !req.params.stakeholderId ||
    !mongoose.Types.ObjectId.isValid(req.params.stakeholderId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    await DebtorDirector.updateOne(
      { _id: req.params.stakeholderId },
      { isDeleted: true },
    );
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Stakeholder deleted successfully',
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in delete debtor-director ',
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
