/*
 * Module Imports
 * */
const axios = require('axios');
const convert = require('xml-js');
const mongoose = require('mongoose');
const Application = mongoose.model('application');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const ClientDebtor = mongoose.model('client-debtor');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { createDebtor } = require('./debtor.helper');

const getEntityDetailsByABN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    }).select({ 'integration.abn': 1 });
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    console.log('options: ', options);
    const { data } = await axios(options);
    const jsonData = convert.xml2js(data);
    return jsonData.elements;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN');
    Logger.log.error(e.message || e);
    return e.message;
  }
};

const getEntityDetailsByACN = async ({ searchString }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    }).select({ 'integration.abn': 1 });
    const url = `https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByASICv201408?searchString=${searchString}&includeHistoricalDetails=y&authenticationGuid=${organization.integration.abn.guid}`;
    const options = {
      method: 'GET',
      url: url,
    };
    const { data } = await axios(options);
    const jsonData = convert.xml2js(data);
    return jsonData.elements;
  } catch (e) {
    Logger.log.error('Error in getting entity details from ABN lookup ');
    Logger.log.error(e.message || e);
    return e.message;
  }
};

//TODO add filter for expiry-date + credit-limit
const getApplicationList = async ({
  applicationColumn,
  requestedQuery,
  isForRisk = true,
  hasFullAccess = false,
  queryFilter = {},
  clientIds = [],
  moduleColumn,
  userId,
}) => {
  try {
    let query = [];
    let sortingOptions = {};
    requestedQuery.page = requestedQuery.page || 1;
    requestedQuery.limit = requestedQuery.limit || 10;
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';

    queryFilter.isDeleted = false;
    if (!hasFullAccess && isForRisk && clientIds.length !== 0) {
      queryFilter.clientId = { $in: clientIds };
    }
    if (userId) {
      queryFilter = Object.assign({}, queryFilter, {
        $or: [
          { status: { $ne: 'DRAFT' } },
          { createdById: mongoose.Types.ObjectId(userId), status: 'DRAFT' },
        ],
      });
    }
    if (requestedQuery.search) {
      queryFilter.applicationId = {
        $regex: `${requestedQuery.search}`,
        $options: 'i',
      };
    }
    if (requestedQuery.status) {
      queryFilter.status = requestedQuery.status;
    }
    if (requestedQuery.clientId) {
      requestedQuery.clientId = requestedQuery.clientId
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
    }
    if (requestedQuery.clientId || applicationColumn.includes('clientId')) {
      query.push(
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
    if (requestedQuery.clientId) {
      query.push({
        $match: {
          'clientId._id': { $in: requestedQuery.clientId },
        },
      });
    }
    if (requestedQuery.debtorId) {
      requestedQuery.debtorId = requestedQuery.debtorId
        .split(',')
        .map((id) => mongoose.Types.ObjectId(id));
    }
    if (
      requestedQuery.debtorId ||
      applicationColumn.includes('debtorId') ||
      applicationColumn.includes('entityType') ||
      requestedQuery.entityType
    ) {
      query.push(
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

    if (requestedQuery.debtorId) {
      query.push({
        $match: {
          'debtorId._id': { $in: requestedQuery.debtorId },
        },
      });
    }
    if (requestedQuery.entityType) {
      query.push({
        $match: {
          'debtorId.entityType': requestedQuery.entityType,
        },
      });
    }

    if (
      applicationColumn.includes('clientDebtorId') ||
      (requestedQuery.minCreditLimit && requestedQuery.maxCreditLimit) ||
      requestedQuery.debtorId ||
      applicationColumn.includes('debtorId')
    ) {
      query.push(
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

    if (requestedQuery.minCreditLimit && requestedQuery.maxCreditLimit) {
      query.push({
        $match: {
          'clientDebtorId.creditLimit': {
            $gte: parseInt(requestedQuery.minCreditLimit),
            $lt: parseInt(requestedQuery.maxCreditLimit),
          },
        },
      });
    }

    const fields = applicationColumn.map((i) => {
      /*if (i === 'clientId') {
          i = i + '.name';
        }*/
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    if (!applicationColumn.includes('clientDebtorId')) {
      fields.push(['clientDebtorId', 1]);
    }
    query.push({
      $project: fields.reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {}),
    });

    if (requestedQuery.sortBy && requestedQuery.sortOrder) {
      if (requestedQuery.sortBy === 'clientId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.name';
      }
      if (requestedQuery.sortBy === 'debtorId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.entityName';
      }
      if (requestedQuery.sortBy === 'clientDebtorId') {
        requestedQuery.sortBy = requestedQuery.sortBy + '.creditLimit';
      }
      if (requestedQuery.sortBy === 'entityType') {
        requestedQuery.sortBy = 'debtorId.' + requestedQuery.sortBy;
      }
      sortingOptions[requestedQuery.sortBy] =
        requestedQuery.sortOrder === 'desc' ? -1 : 1;
      query.push({ $sort: sortingOptions });
    }

    query.push({
      $facet: {
        paginatedResult: [
          {
            $skip:
              (parseInt(requestedQuery.page) - 1) *
              parseInt(requestedQuery.limit),
          },
          { $limit: parseInt(requestedQuery.limit) },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    });
    query.unshift({ $match: queryFilter });

    console.log(query);
    const applications = await Application.aggregate(query).allowDiskUse(true);
    if (applications && applications.length !== 0) {
      applications[0].paginatedResult.forEach((application) => {
        if (applicationColumn.includes('entityType')) {
          application.entityType = application.debtorId.entityType
            .replace(/_/g, ' ')
            .replace(/\w\S*/g, function (txt) {
              return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            });
        }
        if (applicationColumn.includes('clientId')) {
          application.clientId = {
            id: application.clientId._id,
            value: application.clientId.name,
          };
        }
        if (applicationColumn.includes('debtorId')) {
          application.debtorId = {
            id: application.clientDebtorId._id,
            value: application.debtorId.entityName,
          };
        }
        if (applicationColumn.includes('clientDebtorId')) {
          application.clientDebtorId = application.clientDebtorId.creditLimit;
        }
        if (!applicationColumn.includes('clientDebtorId')) {
          delete application.clientDebtorId;
        }
        if (!applicationColumn.includes('debtorId')) {
          delete application.debtorId;
        }
      });
    }
    const total =
      applications[0].totalCount.length !== 0
        ? applications[0]['totalCount'][0]['count']
        : 0;

    const headers = [];
    for (let i = 0; i < moduleColumn.length; i++) {
      if (applicationColumn.includes(moduleColumn[i].name)) {
        headers.push(moduleColumn[i]);
      }
    }

    return {
      docs: applications[0].paginatedResult,
      headers,
      total,
      page: parseInt(requestedQuery.page),
      limit: parseInt(requestedQuery.limit),
      pages: Math.ceil(total / parseInt(requestedQuery.limit)),
    };
  } catch (e) {
    Logger.log.error(
      'Error occurred in get aggregation stages ',
      e.message || e,
    );
  }
};

const storeCompanyDetails = async ({
  requestBody,
  createdBy,
  createdByType,
}) => {
  try {
    const organization = await Organization.findOne({ isDeleted: false })
      .select('entityCount')
      .lean();
    const client = await Client.findOne({ _id: requestBody.clientId }).lean();
    let isDebtorExists = true;
    if (!requestBody.applicationId) {
      const debtorData = await Debtor.findOne({
        $or: [{ abn: requestBody.abn }, { acn: requestBody.acn }],
      }).lean();
      if (debtorData) {
        const application = await Application.findOne({
          clientId: requestBody.clientId,
          debtorId: debtorData._id,
          status: {
            $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
          },
        }).lean();
        if (application) {
          return {
            status: 'ERROR',
            messageCode: 'APPLICATION_ALREADY_EXISTS',
            message: 'Application already exists.',
          };
        }
      } else {
        isDebtorExists = false;
      }
    }
    const { debtor, clientDebtor } = await createDebtor({
      requestBody,
      organization,
      isDebtorExists,
    });
    const applicationDetails = {
      clientId: requestBody.clientId,
      debtorId: debtor._id,
      clientDebtorId: clientDebtor._id,
      applicationStage: 0,
    };
    let application;
    if (!requestBody.applicationId) {
      applicationDetails.applicationId =
        client.clientCode +
        '-' +
        debtor.debtorCode +
        '-' +
        new Date().toISOString().split('T')[0].replace(/-/g, '') +
        '-' +
        (organization.entityCount.application + 1).toString().padStart(3, '0');
      await Organization.updateOne(
        { isDeleted: false },
        { $inc: { 'entityCount.application': 1 } },
      );
      applicationDetails.createdById = createdBy;
      applicationDetails.createdByType = createdByType;
      application = await Application.create(applicationDetails);
    } else {
      await Application.updateOne(
        { _id: requestBody.applicationId },
        applicationDetails,
      );
      application = await Application.findById(
        requestBody.applicationId,
      ).lean();
    }
    return { debtor, clientDebtor, application };
  } catch (e) {
    Logger.log.error(
      'Error occurred in store company details ',
      e.message || e,
    );
  }
};

const storePartnerDetails = async ({ requestBody }) => {
  try {
    let individualCount = 0;
    let companyCount = 0;
    requestBody.partners.forEach((data) =>
      data.type.toLowerCase() === 'company'
        ? companyCount++
        : individualCount++,
    );
    const isValidate = partnerDetailsValidation({
      entityType: requestBody.entityType,
      individualCount,
      companyCount,
    });
    if (!isValidate) {
      return {
        status: 'ERROR',
        messageCode: 'INSUFFICIENT_DATA',
        message: 'Insufficient partners details.',
      };
    }
    const person = [];
    const company = [];
    requestBody.partners.forEach((data) => {
      let update = {};
      if (data.type.toLowerCase() === 'individual') {
        if (data.address && Object.keys(data.address).length !== 0) {
          update.residentialAddress = {
            property: data.address.property,
            unitNumber: data.address.unitNumber,
            streetNumber: data.address.streetNumber,
            streetName: data.address.streetName,
            streetType: data.address.streetType,
            suburb: data.address.suburb,
            state: data.address.state,
            country: data.address.country,
            postCode: data.address.postCode,
          };
        }
        if (data.title) update.title = data.title;
        if (data.firstName) update.firstName = data.firstName;
        if (data.middleName) update.middleName = data.middleName;
        if (data.lastName) update.lastName = data.lastName;
        if (data.dateOfBirth) update.dateOfBirth = data.dateOfBirth;
        if (data.driverLicenceNumber)
          update.driverLicenceNumber = data.driverLicenceNumber;
        if (data.phoneNumber) update.phoneNumber = data.phoneNumber;
        if (data.mobileNumber) update.mobileNumber = data.mobileNumber;
        if (data.email) update.email = data.email;
        if (data.hasOwnProperty('allowToCheckCreditHistory'))
          update.allowToCheckCreditHistory = data.allowToCheckCreditHistory;
        person.push(update);
      } else {
        if (data.abn) update.abn = data.abn;
        if (data.acn) update.acn = data.acn;
        if (data.entityType) update.entityType = data.entityType;
        if (data.entityName) update.entityName = data.entityName;
        if (data.tradingName) update.tradingName = data.tradingName;
        company.push(update);
      }
    });
    const update = {
      person: person,
      company: company,
      applicationStage: 1,
    };
    await Application.updateOne(
      { _id: requestBody.applicationId },
      { partners: update },
    );
    const application = await Application.findById(
      requestBody.applicationId,
    ).lean();
    return application;
  } catch (e) {
    Logger.log.error(
      'Error occurred in store partners details ',
      e.message || e,
    );
  }
};

const storeCreditLimitDetails = async ({ requestBody }) => {
  try {
    const update = {
      creditLimit: requestBody.creditLimit,
      isExtendedPaymentTerms: requestBody.isExtendedPaymentTerms,
      isPassedOverdueAmount: requestBody.isPassedOverdueAmount,
      applicationStage: 2,
    };
    if (requestBody.extendedPaymentTermsDetails)
      update.extendedPaymentTermsDetails =
        requestBody.extendedPaymentTermsDetails;
    if (requestBody.passedOverdueDetails)
      update.passedOverdueDetails = requestBody.passedOverdueDetails;
    await Application.updateOne({ _id: requestBody.applicationId }, update);
    const application = await Application.findById(
      requestBody.applicationId,
    ).lean();
    return application;
  } catch (e) {
    Logger.log.error(
      'Error occurred in store credit-limit details ',
      e.message || e,
    );
  }
};

const partnerDetailsValidation = ({
  entityType,
  individualCount,
  companyCount,
}) => {
  try {
    let response = false;
    switch (entityType) {
      case 'PROPRIETARY_LIMITED':
      case 'LIMITED_COMPANY':
        response = individualCount >= 1 && companyCount === 0;
        break;
      case 'PARTNERSHIP':
        response = individualCount >= 1 && companyCount >= 1;
        break;
      case 'SOLE_TRADER':
        response = individualCount === 1 && companyCount === 0;
        break;
      case 'TRUST':
        response = individualCount >= 1 || companyCount >= 1;
        break;
      case 'BUSINESS':
      case 'CORPORATION':
      case 'GOVERNMENT':
      case 'INCORPORATED':
      case 'NO_LIABILITY':
      case 'PROPRIETARY':
      case 'REGISTERED_BODY':
        response = individualCount >= 1 && companyCount === 0;
        break;
    }
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in partner details validation ',
      e.message || e,
    );
  }
};

module.exports = {
  getEntityDetailsByABN,
  getEntityDetailsByACN,
  getApplicationList,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
};
