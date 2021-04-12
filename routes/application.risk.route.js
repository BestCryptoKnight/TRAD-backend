/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = mongoose.model('user');
const Client = mongoose.model('client');
const Debtor = mongoose.model('debtor');
const DebtorDirector = mongoose.model('debtor-director');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const {
  getApplicationList,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
} = require('./../helper/application.helper');
const {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getEntityListByName,
  resolveEntityType,
} = require('./../helper/abr.helper');
const { getClientList } = require('./../helper/client.helper');
const { getDebtorList } = require('./../helper/debtor.helper');
const StaticData = require('./../static-files/staticData.json');
const { getClientDebtorDetails } = require('./../helper/client-debtor.helper');
const { getApplicationDocumentList } = require('./../helper/document.helper');

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
 * Get Entity List
 * */
router.get('/entity-list', async function (req, res) {
  try {
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
    }
    const [clients, debtors] = await Promise.all([
      getClientList({ hasFullAccess: hasFullAccess, userId: req.user._id }),
      getDebtorList(),
    ]);
    res.status(200).send({
      status: 'SUCCESS',
      data: {
        clients: { field: 'clientId', data: clients },
        debtors: { field: 'debtorId', data: debtors },
        streetType: { field: 'streetType', data: StaticData.streetType },
        australianStates: { field: 'state', data: StaticData.australianStates },
        newZealandStates: { field: 'state', data: StaticData.newZealandStates },
        entityType: { field: 'entityType', data: StaticData.entityType },
        companyEntityType: {
          field: 'entityType',
          data: StaticData.companyEntityType,
        },
        applicationStatus: {
          field: 'applicationStatus',
          data: StaticData.applicationStatus,
        },
        countryList: { field: 'country', data: StaticData.countryList },
      },
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
 * Get List
 */
router.get('/', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const applicationColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'application',
    );
    let clientIds;
    let hasFullAccess = true;
    if (req.accessTypes && req.accessTypes.indexOf('full-access') === -1) {
      hasFullAccess = false;
      const clients = await Client.find({
        isDeleted: false,
        $or: [
          { riskAnalystId: req.user._id },
          { serviceManagerId: req.user._id },
        ],
      })
        .select({ _id: 1 })
        .lean();
      clientIds = clients.map((i) => i._id);
    }

    const response = await getApplicationList({
      hasFullAccess: hasFullAccess,
      applicationColumn: applicationColumn.columns,
      isForRisk: true,
      requestedQuery: req.query,
      clientIds: clientIds,
      moduleColumn: module.manageColumns,
      userId: req.user._id,
    });

    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application list ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Application Modal details
 */
router.get('/drawer-details/:applicationId', async function (req, res) {
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
    const module = StaticFile.modules.find((i) => i.name === 'application');
    const debtor = StaticFile.modules.find((i) => i.name === 'debtor');
    const application = await Application.findById(req.params.applicationId)
      .populate({
        path: 'clientId debtorId clientDebtorId',
        select: {
          __v: 0,
          updatedAt: 0,
          debtorCode: 0,
          createdAt: 0,
        },
      })
      .select({
        __v: 0,
        updatedAt: 0,
        createdAt: 0,
        createdById: 0,
        createdByType: 0,
        applicationStage: 0,
      })
      .lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const debtorDetails = await getClientDebtorDetails({
      debtor: application,
      manageColumns: debtor.manageColumns,
    });
    let response = [];
    let value = '';
    module.manageColumns.forEach((i) => {
      value =
        i.name === 'clientId'
          ? application['clientId'][i.name]
          : i.name === 'outstandingAmount'
          ? application['clientDebtorId'][i.name]
          : i.name === 'isExtendedPaymentTerms' ||
            i.name === 'isPassedOverdueAmount'
          ? application[i.name]
            ? 'Yes'
            : 'No'
          : application[i.name];
      if (i.name === 'status') {
        value = value.replace(/_/g, ' ').replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
      }
      if (typeof value === 'string') {
        response.push({
          label: i.label,
          value: value || '',
          type: i.type,
        });
      }
    });
    response = response.concat(debtorDetails);
    res.status(200).send({ status: 'SUCCESS', data: response });
  } catch (e) {
    Logger.log.error(
      'Error occurred in get application modal details ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Get Application Details
 */
router.get('/details/:applicationId', async function (req, res) {
  if (
    !req.params.applicationId ||
    !mongoose.Types.ObjectId.isValid(req.params.applicationId)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const application = await Application.findById(req.params.applicationId)
      .populate({
        path: 'clientId debtorId clientDebtorId',
        select: {
          __v: 0,
          isActive: 0,
          updatedAt: 0,
          debtorCode: 0,
          createdAt: 0,
        },
      })
      .select({ __v: 0, updatedAt: 0, createdAt: 0 })
      .lean();
    if (!application) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application found',
      });
    }
    const directors = await DebtorDirector.find({
      debtorId: application.debtorId,
    })
      .select({ createdAt: 0, updatedAt: 0, __v: 0 })
      .lean();
    let response = {};
    if (application.status === 'DRAFT') {
      response._id = application._id;
      response.applicationStage = application.applicationStage;
      response.company = {};
      if (application.clientId) {
        response.company.clientId = [
          {
            value: application.clientId._id,
            label: application.clientId.name,
          },
        ];
      }
      if (application.debtorId) {
        response.company.debtorId = [
          {
            value: application.debtorId._id,
            label: application.debtorId.entityName,
          },
        ];
        for (let key in application.debtorId) {
          response.company[key] = application.debtorId[key];
        }
        if (response.company.entityName) {
          response.company.entityName = [
            {
              value: application.debtorId._id,
              label: response.company.entityName,
            },
          ];
        }
        if (response.company.entityType) {
          response.company.entityType = [
            {
              value: response.company.entityType,
              label:
                response.company.entityType.charAt(0).toUpperCase() +
                response.company.entityType.slice(1).toLowerCase(),
            },
          ];
        }
        for (let key in response.company.address) {
          response.company[key] = response.company.address[key];
        }
        if (response.company.state) {
          const state =
            response.company.country.code === 'AUS'
              ? StaticData.australianStates.find((i) => {
                  if (i._id === response.company.state) return i;
                })
              : response.company.country.code === 'NZL'
              ? StaticData.newZealandStates.find((i) => {
                  if (i._id === response.company.state) return i;
                })
              : { name: response.company.state };
          response.company.state = [
            {
              value: response.company.state,
              label: state && state.name ? state.name : response.company.state,
            },
          ];
        }
        if (response.company.country) {
          response.company.country = [
            {
              value: response.company.country.code,
              label: response.company.country.name,
            },
          ];
        }
        if (response.company.streetType) {
          const streetType = StaticData.streetType.find((i) => {
            if (i._id === response.company.streetType) return i;
          });
          response.company.streetType = [
            {
              value: response.company.streetType,
              label:
                streetType && streetType.name
                  ? streetType.name
                  : response.company.streetType,
            },
          ];
        }
        delete response.company.address;
      }
      if (application.creditLimit) {
        response.creditLimit = {
          creditLimit: application.creditLimit,
          isExtendedPaymentTerms: application.isExtendedPaymentTerms,
          extendedPaymentTermsDetails: application.extendedPaymentTermsDetails,
          isPassedOverdueAmount: application.isPassedOverdueAmount,
          passedOverdueDetails: application.passedOverdueDetails,
        };
      }
      if (directors && directors.length !== 0) {
        response.partners = directors;
        response.partners.forEach((partner) => {
          partner.isDisabled = true;
          if (partner.type === 'individual') {
            if (partner.title) {
              partner.title = [
                {
                  value: partner.title,
                  label: partner.title,
                },
              ];
            }
            for (let key in partner.residentialAddress) {
              partner[key] = partner.residentialAddress[key];
            }
            if (partner.country) {
              partner.country = [
                {
                  value: partner.country.code,
                  label: partner.country.name,
                },
              ];
            }
            if (partner.state) {
              const state =
                partner.country.code === 'AUS'
                  ? StaticData.australianStates.find((i) => {
                      if (i._id === partner.state) return i;
                    })
                  : partner.country.code === 'NZL'
                  ? StaticData.newZealandStates.find((i) => {
                      if (i._id === partner.state) return i;
                    })
                  : { name: partner.state };
              partner.state = [
                {
                  value: partner.state,
                  label: state && state.name ? state.name : partner.state,
                },
              ];
            }
            if (partner.streetType) {
              const streetType = StaticData.streetType.find((i) => {
                if (i._id === partner.streetType) return i;
              });
              partner.streetType = [
                {
                  value: partner.streetType,
                  label:
                    streetType && streetType.name
                      ? streetType.name
                      : partner.streetType,
                },
              ];
            }
            delete partner.residentialAddress;
          } else {
            if (partner.entityName) {
              partner.entityName = [
                {
                  value: application.debtorId._id,
                  label: partner.entityName,
                },
              ];
            }
            if (partner.entityType) {
              partner.entityType = [
                {
                  value: partner.entityType,
                  label:
                    partner.entityType.charAt(0).toUpperCase() +
                    partner.entityType.slice(1).toLowerCase(),
                },
              ];
            }
          }
        });
      }
      response.documents = await getApplicationDocumentList({
        entityId: application._id,
      });
    } else {
      if (application.clientId) {
        response.clientId = {
          _id: application.clientId._id,
          name: application.clientId.name,
        };
      }
      if (application.debtorId) {
        response.debtorId = {
          _id: application.debtorId._id,
          name: application.debtorId.entityName,
        };
        for (let key in application.debtorId) {
          if (key === 'address') {
            response[key] = Object.values(application.debtorId[key])
              .toString()
              .replace(/,,/g, ',');
          } else {
            response[key] = application.debtorId[key];
          }
        }
      }
      if (application.clientDebtorId) {
        application.outstandingAmount =
          application.clientDebtorId.outstandingAmount;
      }
      response.creditLimit = application.creditLimit;
      response.isExtendedPaymentTerms = application.isExtendedPaymentTerms;
      response.extendedPaymentTermsDetails =
        application.extendedPaymentTermsDetails;
      response.isPassedOverdueAmount = application.isPassedOverdueAmount;
      response.passedOverdueDetails = application.passedOverdueDetails;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get application details ', e);
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
    const response = await getApplicationList({
      hasFullAccess: false,
      applicationColumn: applicationColumn.columns,
      isForRisk: true,
      requestedQuery: req.query,
      queryFilter: queryFilter,
      moduleColumn: module.manageColumns,
      userId: req.user._id,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
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
  if (!req.params.searchString || !req.query.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findOne({
      $or: [{ abn: req.params.searchString }, { acn: req.params.searchString }],
    }).lean();
    if (debtor) {
      const application = await Application.findOne({
        clientId: req.query.clientId,
        debtorId: debtor._id,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED', 'DRAFT'],
        },
      }).lean();
      if (application) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message: 'Application already exists.',
        });
      }
    }
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
    let response = {};
    if (entityData && entityData.response) {
      const entityDetails =
        entityData.response.businessEntity202001 ||
        entityData.response.businessEntity201408;
      console.log(entityDetails);
      if (entityDetails.ABN) response.abn = entityDetails.ABN.identifierValue;
      if (
        entityDetails.entityStatus &&
        entityDetails.entityStatus.entityStatusCode
      )
        response.isActive = entityDetails.entityStatus.entityStatusCode;
      if (
        entityDetails.entityStatus &&
        entityDetails.entityStatus.effectiveFrom
      )
        response.registeredDate = entityDetails.entityStatus.effectiveFrom;
      if (entityDetails.ASICNumber)
        response.acn =
          typeof entityDetails.ASICNumber === 'string'
            ? entityDetails.ASICNumber
            : '';
      if (entityDetails.entityType) {
        const entityType = await resolveEntityType({
          entityType: entityDetails.entityType.entityDescription,
        });
        response.entityType = [
          {
            label: entityType
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, function (txt) {
                return (
                  txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                );
              }),
            value: entityType,
          },
        ];
      }
      if (entityDetails.goodsAndServicesTax)
        response.gstStatus = entityDetails.goodsAndServicesTax.effectiveFrom;
      if (entityDetails.mainName)
        response.entityName = [
          {
            label: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
            value: Array.isArray(entityDetails.mainName)
              ? entityDetails.mainName[0].organisationName
              : entityDetails.mainName.organisationName,
          },
        ];
      const tradingName =
        entityDetails.mainTradingName || entityDetails.businessName;
      if (tradingName)
        response.tradingName =
          tradingName.organisationName ||
          typeof tradingName.organisationName === 'string'
            ? tradingName.organisationName
            : tradingName[0].organisationName;
      if (entityDetails.mainBusinessPhysicalAddress[0]) {
        const state = StaticData.australianStates.find((i) => {
          if (i._id === entityDetails.mainBusinessPhysicalAddress[0].stateCode)
            return i;
        });
        response.state = [
          {
            label:
              state && state.name
                ? state.name
                : entityDetails.mainBusinessPhysicalAddress[0].stateCode,
            value: entityDetails.mainBusinessPhysicalAddress[0].stateCode,
          },
        ];
      }
      if (entityDetails.mainBusinessPhysicalAddress[0])
        response.postCode =
          entityDetails.mainBusinessPhysicalAddress[0].postcode;
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in search by ABN number  ', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Search from Entity Name
 */
router.get('/search-entity-list/:searchString', async function (req, res) {
  if (!req.params.searchString || !req.query.clientId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    const debtor = await Debtor.findOne({
      $or: [{ abn: req.params.searchString }, { acn: req.params.searchString }],
    }).lean();
    if (debtor) {
      const application = await Application.findOne({
        clientId: req.query.clientId,
        debtorId: debtor._id,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED', 'DRAFT'],
        },
      }).lean();
      if (application) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message: 'Application already exists.',
        });
      }
    }
    let entityList = await getEntityListByName({
      searchString: req.params.searchString,
    });
    let response = [];
    let entityData = {};
    if (
      entityList.ABRPayloadSearchResults.response &&
      entityList.ABRPayloadSearchResults.response.searchResultsList &&
      entityList.ABRPayloadSearchResults.response.searchResultsList
        .searchResultsRecord.length !== 0
    ) {
      entityList.ABRPayloadSearchResults.response.searchResultsList.searchResultsRecord.forEach(
        (data) => {
          entityData = {};
          if (data.ABN) entityData.abn = data.ABN.identifierValue;
          if (data.ABN) entityData.status = data.ABN.identifierStatus;
          let fieldName =
            data.mainName ||
            data.businessName ||
            data.otherTradingName ||
            data.mainTradingName;
          if (fieldName) {
            entityData.label = fieldName.organisationName;
            entityData.value = fieldName.organisationName;
          }
          if (data.mainBusinessPhysicalAddress) {
            entityData.state = data.mainBusinessPhysicalAddress.stateCode;
            entityData.postCode = data.mainBusinessPhysicalAddress.postcode;
          }
          response.push(entityData);
        },
      );
    }
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
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
 * Generate Application
 */
router.put('/', async function (req, res) {
  if (!req.body.stepper) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper !== 'company' &&
    (!req.body.applicationId ||
      !mongoose.Types.ObjectId.isValid(req.body.applicationId))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'company' &&
    (!req.body.clientId ||
      !req.body.address ||
      !req.body.entityType ||
      !req.body.entityName)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'person' &&
    (!req.body.entityType ||
      !req.body.partners ||
      req.body.partners.length === 0)
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  if (
    req.body.stepper === 'credit-limit' &&
    (!req.body.creditLimit ||
      !req.body.hasOwnProperty('isPassedOverdueAmount') ||
      !req.body.hasOwnProperty('isExtendedPaymentTerms'))
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let response;
    let message;
    switch (req.body.stepper) {
      case 'company':
        response = await storeCompanyDetails({
          requestBody: req.body,
          createdByType: 'user',
          createdBy: req.user._id,
        });
        break;
      case 'person':
        response = await storePartnerDetails({ requestBody: req.body });
        break;
      case 'credit-limit':
        response = await storeCreditLimitDetails({ requestBody: req.body });
        break;
      case 'documents':
        await Application.updateOne(
          { _id: req.body.applicationId },
          { $set: { applicationStage: 3 } },
        );
        response = await Application.findById(req.body.applicationId)
          .select('_id applicationStage')
          .lean();
        break;
      case 'confirmation':
        await Application.updateOne(
          { _id: req.body.applicationId },
          { $set: { status: 'SUBMITTED', applicationStage: 4 } },
        );
        message = 'Application submitted successfully.';
        break;
      default:
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'BAD_REQUEST',
          message: 'Please pass correct fields',
        });
    }
    if (response && response.status && response.status === 'ERROR') {
      return res.status(400).send(response);
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: message,
      data: response,
    });
  } catch (e) {
    Logger.log.error(
      'Error occurred in generating application ',
      e.message || e,
    );
    res.status(500).send({
      status: 'ERROR',
      message: e,
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
