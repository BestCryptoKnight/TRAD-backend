/*
 * Module Imports
 * */
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ClientUser = mongoose.model('client-user');
const ClientDebtor = mongoose.model('client-debtor');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const Application = mongoose.model('application');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const StaticFile = require('./../static-files/moduleColumn');
const StaticData = require('./../static-files/staticData.json');
const {
  getClientDebtorDetails,
  convertToCSV,
  getClientCreditLimit,
  formatCSVList,
  downloadDecisionLetter,
} = require('./../helper/client-debtor.helper');
const { getDebtorFullAddress } = require('./../helper/debtor.helper');
const { generateNewApplication } = require('./../helper/application.helper');
const {
  getStakeholderList,
  getStakeholderDetails,
} = require('./../helper/stakeholder.helper');
const { checkForEntityInProfile } = require('./../helper/alert.helper');
const { generateExcel } = require('./../helper/excel.helper');
const { addAuditLog } = require('./../helper/audit-log.helper');

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
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = req.user.manageColumns.find(
      (i) => i.moduleName === 'credit-limit',
    );
    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn.columns,
      clientId: req.user.clientId,
      moduleColumn: module.manageColumns,
      isForRisk: false,
    });
    res.status(200).send({
      status: 'SUCCESS',
      data: response,
    });
  } catch (e) {
    Logger.log.error('Error occurred in get client-debtor details ', e);
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
      const response = await getStakeholderDetails({
        stakeholderId: req.params.stakeholderId,
        manageColumns: module.manageColumns,
      });
      if (response && response.status && response.status === 'ERROR') {
        return res.status(400).send(response);
      }
      res.status(200).send({
        status: 'SUCCESS',
        data: { response, header: 'Stakeholder Details' },
      });
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
    const response = await getStakeholderList({
      debtorId: req.params.debtorId,
      requestedQuery: req.query,
      manageColumns: module.manageColumns,
      stakeholderColumn: stakeholderColumn.columns,
    });
    res.status(200).send({ status: 'SUCCESS', data: response });
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
    res.status(200).send({
      status: 'SUCCESS',
      data: { response, header: 'Debtor Details' },
    });
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
  if (!req.params.debtorId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let responseData = {};
    const application = await Application.findOne({
      debtorId: req.params.debtorId,
      clientId: req.user.clientId,
      status: {
        $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
      },
    }).lean();
    let anotherApplication;
    if (application) {
      anotherApplication = await Application.findOne({
        _id: { $ne: application._id },
        debtorId: req.params.debtorId,
        clientId: req.user.clientId,
        status: {
          $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
        },
      });
    }
    if (
      application &&
      application.status !== 'APPROVED' &&
      anotherApplication
    ) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'APPLICATION_ALREADY_EXISTS',
        message:
          'Application already exists, please create with another debtor',
      });
    } else if (application && application.status === 'APPROVED') {
      const otherApplication = await Application.findOne({
        debtorId: req.params.debtorId,
        clientId: req.user.clientId,
        status: {
          $nin: [
            'DECLINED',
            'CANCELLED',
            'WITHDRAWN',
            'SURRENDERED',
            'APPROVED',
          ],
        },
      }).lean();
      if (otherApplication) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'APPLICATION_ALREADY_EXISTS',
          message:
            'Application already exists, please create with another debtor',
        });
      }
      responseData.message =
        'You already have one approved application, do you still want to create another one?';
      responseData.messageCode = 'APPROVED_APPLICATION_ALREADY_EXISTS';
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
        debtor.country = {
          label: debtor.country.name,
          value: debtor.country.code,
        };
      }
      if (debtor.entityType) {
        debtor.entityType = {
          label: debtor.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: debtor.entityType,
        };
      }
      if (debtor.entityName) {
        debtor.entityName = {
          label: debtor.entityName,
          value: debtor.entityName,
        };
      }
      if (debtor.state) {
        const state = StaticData.australianStates.find((i) => {
          if (i._id === debtor.state) return i;
        });
        if (state) {
          debtor.state = {
            label: state.name,
            value: debtor.state,
          };
        }
      }
      if (debtor.streetType) {
        const streetType = StaticData.streetType.find((i) => {
          if (i._id === debtor.streetType) return i;
        });
        if (streetType) {
          debtor.streetType = {
            label: streetType.name,
            value: debtor.streetType,
          };
        }
      }
    }
    responseData.status = 'SUCCESS';
    responseData.data = debtor;
    res.status(200).send(responseData);
  } catch (e) {
    Logger.log.error('Error occurred in get debtor details ', e.message || e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download credit-limit in CSV
 */
router.get('/download', async function (req, res) {
  try {
    const module = StaticFile.modules.find((i) => i.name === 'credit-limit');
    const debtorColumn = [
      'entityName',
      'entityType',
      'abn',
      'acn',
      'registrationNumber',
      'country',
      'requestedAmount',
      'creditLimit',
      'approvalOrDecliningDate',
      'expiryDate',
      'limitType',
      'clientReference',
      'comments',
    ];
    const response = await getClientCreditLimit({
      requestedQuery: req.query,
      debtorColumn: debtorColumn,
      clientId: req.user.clientId,
      moduleColumn: module.manageColumns,
      isForDownload: true,
    });
    if (response && response?.docs.length > 20000) {
      return res.status(400).send({
        status: 'ERROR',
        messageCode: 'DOWNLOAD_LIMIT_EXCEED',
        message:
          'User cannot download more than 20000 records at a time. Please apply filter to narrow down the list',
      });
    }
    if (response && response.docs.length !== 0) {
      const headers = [
        { name: 'entityName', label: 'Debtor Name', type: 'string' },
        { name: 'abn', label: 'ABN/NZBN', type: 'string' },
        { name: 'acn', label: 'ACN/NCN', type: 'string' },
        {
          name: 'registrationNumber',
          label: 'Registration Number',
          type: 'string',
        },
        { name: 'country', label: 'Country', type: 'string' },
        {
          name: 'requestedAmount',
          label: 'Requested Amount',
          type: 'amount',
        },
        {
          name: 'creditLimit',
          label: 'Approved Amount',
          type: 'amount',
        },
        {
          name: 'approvalOrDecliningDate',
          label: 'Approval Date',
          type: 'date',
        },
        { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        { name: 'limitType', label: 'Limit Type', type: 'string' },
        {
          name: 'clientReference',
          label: 'Client Reference',
          type: 'string',
        },
        { name: 'comments', label: 'Comments', type: 'string' },
      ];
      const finalArray = [];
      let data = {};
      response.docs.forEach((i) => {
        data = {};
        debtorColumn.map((key) => {
          data[key] = i[key];
        });
        finalArray.push(data);
      });
      const client = await Client.findOne({ _id: req.user.clientId })
        .select('clientCode name')
        .lean();
      response.filterArray.unshift({
        label: 'Client Name',
        value: client?.name,
        type: 'string',
      });
      const excelData = await generateExcel({
        data: finalArray,
        reportFor: 'Credit Limit List',
        headers,
        filter: response.filterArray,
      });
      res.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const fileName =
        client?.clientCode + '-credit-limit-' + Date.now() + '.xlsx';
      res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
      res.status(200).send(excelData);
    } else {
      res.status(400).send({
        status: 'ERROR',
        message: 'No data found for download file',
      });
    }
  } catch (e) {
    Logger.log.error('Error occurred in download in csv', e);
    res.status(500).send({
      status: 'ERROR',
      message: e.message || 'Something went wrong, please try again later.',
    });
  }
});

/**
 * Download Decision Letter
 */
router.get(
  '/download/decision-letter/:creditLimitId',
  async function (req, res) {
    try {
      const { bufferData, applicationNumber } = await downloadDecisionLetter({
        creditLimitId: req.params.creditLimitId,
      });
      if (bufferData) {
        const fileName = applicationNumber + '_ResCheckDecision.pdf';
        res
          .writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename=' + fileName,
          })
          .end(bufferData);
      } else {
        res.status(400).send({
          status: 'ERROR',
          message: 'No decision letter found',
        });
      }
    } catch (e) {
      Logger.log.error('Error occurred in download in csv', e);
      res.status(500).send({
        status: 'ERROR',
        message: e.message || 'Something went wrong, please try again later.',
      });
    }
  },
);

/**
 * Get Debtor Details
 */
router.get('/:creditLimitId', async function (req, res) {
  if (!req.params.creditLimitId) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing.',
    });
  }
  try {
    let debtor = await ClientDebtor.findOne({
      _id: req.params.creditLimitId,
    })
      .populate({
        path: 'debtorId',
        select: { isDeleted: 0, createdAt: 0, updatedAt: 0, __v: 0 },
      })
      .lean();
    debtor = debtor.debtorId;
    if (debtor) {
      if (debtor.address) {
        for (let key in debtor.address) {
          debtor[key] = debtor.address[key];
        }
        debtor.address = getDebtorFullAddress({
          address: debtor.address,
          country: debtor.address.country,
        });
      }
      if (debtor.country) {
        debtor.country = {
          label: debtor.country.name,
          value: debtor.country.code,
        };
      }
      if (debtor.entityType) {
        debtor.entityType = {
          label: debtor.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }),
          value: debtor.entityType,
        };
      }
      if (debtor.entityName) {
        debtor.entityName = {
          label: debtor.entityName,
          value: debtor.entityName,
        };
      }
      if (debtor.state) {
        const state = StaticData.australianStates.find((i) => {
          if (i._id === debtor.state) return i;
        });
        if (state) {
          debtor.state = {
            label: state.name,
            value: debtor.state,
          };
        }
      }
      if (debtor.streetType) {
        const streetType = StaticData.streetType.find((i) => {
          if (i._id === debtor.streetType) return i;
        });
        if (streetType) {
          debtor.streetType = {
            label: streetType.name,
            value: debtor.streetType,
          };
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
      case 'credit-limit':
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
    await ClientUser.updateOne(
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
 * Update credit-limit
 */
router.put('/credit-limit/:creditLimitId', async function (req, res) {
  if (
    !req.params.creditLimitId ||
    !mongoose.Types.ObjectId.isValid(req.params.creditLimitId) ||
    !req.body.action
  ) {
    return res.status(400).send({
      status: 'ERROR',
      messageCode: 'REQUIRE_FIELD_MISSING',
      message: 'Require fields are missing',
    });
  }
  try {
    const clientDebtor = await ClientDebtor.findOne({
      _id: req.params.creditLimitId,
    })
      .populate({ path: 'clientId debtorId', select: 'name entityName' })
      .lean();
    if (req.body.action === 'modify') {
      if (!req.body.creditLimit || !/^\d+$/.test(req.body.creditLimit)) {
        return res.status(400).send({
          status: 'ERROR',
          messageCode: 'REQUIRE_FIELD_MISSING',
          message: 'Require fields are missing',
        });
      }
      await addAuditLog({
        entityType: 'credit-limit',
        entityRefId: req.params.creditLimitId,
        actionType: 'edit',
        userType: 'client-user',
        userRefId: req.user.clientId,
        logDescription: `A credit limit of ${clientDebtor?.clientId?.name} ${clientDebtor?.debtorId?.entityName} is modified by ${clientDebtor?.clientId?.name}`,
      });
      await generateNewApplication({
        clientDebtorId: clientDebtor._id,
        createdById: req.user.clientId,
        createdByType: 'client-user',
        creditLimit: req.body.creditLimit,
      });
    } else {
      await ClientDebtor.updateOne(
        { _id: req.params.creditLimitId },
        {
          creditLimit: undefined,
          isActive: false,
        },
      );
      await addAuditLog({
        entityType: 'credit-limit',
        entityRefId: req.params.creditLimitId,
        actionType: 'edit',
        userType: 'client-user',
        userRefId: req.user.clientId,
        logDescription: `A credit limit of ${clientDebtor?.clientId?.name} ${clientDebtor?.debtorId?.entityName} is surrendered by ${clientDebtor?.clientId?.name}`,
      });
      const hasActiveCreditLimit = await checkForActiveCreditLimit({
        debtorId: clientDebtor?.debtorId?._id,
      });
      if (!hasActiveCreditLimit) {
        //TODO uncomment to remove entity from alert profile
        if (clientDebtor?.debtorId?._id) {
          checkForEntityInProfile({
            entityId: clientDebtor.debtorId._id,
            action: 'remove',
            entityType: 'debtor',
          });
        }
      }
    }
    res.status(200).send({
      status: 'SUCCESS',
      message: 'Credit limit updated successfully',
    });
  } catch (e) {
    Logger.log.error('Error occurred in update credit-limit', e.message || e);
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
