/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Application = mongoose.model('application');
const Organization = mongoose.model('organization');
const Debtor = mongoose.model('debtor');
const Client = mongoose.model('client');
const DebtorDirector = mongoose.model('debtor-director');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { createDebtor } = require('./debtor.helper');
const { getEntityDetailsByABN } = require('./abr.helper');

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

    if (applicationColumn.includes('outstandingAmount')) {
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
          creditLimit: {
            $gte: parseInt(requestedQuery.minCreditLimit),
            $lt: parseInt(requestedQuery.maxCreditLimit),
          },
        },
      });
    }
    //TODO add filter for expiry date
    if (requestedQuery.startDate && requestedQuery.maxCreditLimit) {
    }

    const fields = applicationColumn.map((i) => {
      if (i === 'outstandingAmount') {
        i = 'clientDebtorId';
      }
      if (i === 'debtorId') {
        i = i + '.entityName';
      }
      if (i === 'entityType') {
        i = 'debtorId.' + i;
      }
      return [i, 1];
    });
    if (applicationColumn.includes('debtorId')) {
      fields.push(['debtorId._id', 1]);
    }
    if (!applicationColumn.includes('outstandingAmount')) {
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
      if (requestedQuery.sortBy === 'outstandingAmount') {
        requestedQuery.sortBy = 'clientDebtorId.' + requestedQuery.sortBy;
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

    const applications = await Application.aggregate(query).allowDiskUse(true);
    if (applications && applications.length !== 0) {
      applications[0].paginatedResult.forEach((application) => {
        console.log(application);
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
            id: application.debtorId._id,
            value: application.debtorId.entityName,
          };
        }
        if (applicationColumn.includes('outstandingAmount')) {
          application.outstandingAmount =
            application.clientDebtorId.outstandingAmount;
        }
        if (!applicationColumn.includes('debtorId')) {
          delete application.debtorId;
        }
        delete application.clientDebtorId;
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
    Logger.log.error('Error occurred in get aggregation stages ', e);
  }
};

//TODO verify ABN & ACN
const storeCompanyDetails = async ({
  requestBody,
  createdBy,
  createdByType,
  createdByName,
  clientId,
}) => {
  try {
    const organization = await Organization.findOne({ isDeleted: false })
      .select('entityCount')
      .lean();
    const client = await Client.findOne({ _id: clientId }).lean();
    let isDebtorExists = true;
    if (!requestBody.applicationId) {
      const debtorData = await Debtor.findOne({
        $or: [{ abn: requestBody.abn }, { acn: requestBody.acn }],
      }).lean();
      if (debtorData) {
        const application = await Application.findOne({
          clientId: clientId,
          debtorId: debtorData._id,
          status: {
            $nin: ['DECLINED', 'CANCELLED', 'WITHDRAWN', 'SURRENDERED'],
          },
        }).lean();
        if (application) {
          return {
            status: 'ERROR',
            messageCode: 'APPLICATION_ALREADY_EXISTS',
            message: 'Application already exists',
          };
        }
      } else {
        isDebtorExists = false;
      }
    }
    if (requestBody.address.country.code === 'AUS' && requestBody.abn) {
      const entityData = await getEntityDetailsByABN({
        searchString: requestBody.abn,
      });
      if (
        !entityData ||
        !entityData.response ||
        !entityData.response.businessEntity202001
      ) {
        return {
          status: 'ERROR',
          messageCode: 'INVALID_ABN_NUMBER',
          message: 'Invalid ABN number',
        };
      }
    }
    const { debtor, clientDebtor } = await createDebtor({
      requestBody,
      organization,
      isDebtorExists,
      userId: createdBy,
      userName: createdByName,
      clientId,
    });
    const applicationDetails = {
      clientId: clientId,
      debtorId: debtor._id,
      clientDebtorId: clientDebtor._id,
      applicationStage: 1,
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
      application = await Application.findById(requestBody.applicationId)
        .select('_id applicationStage')
        .lean();
      if (!application) {
        return {
          status: 'ERROR',
          messageCode: 'NO_APPLICATION_FOUND',
          message: 'No application found',
        };
      }
    }
    const partners = await DebtorDirector.find({
      debtorId: debtor._id,
      isDeleted: false,
    })
      .select({ __v: 0, updatedAt: 0, createdAt: 0, isDeleted: 0 })
      .lean();
    partners.forEach((data) => {
      data.isDisabled = true;
    });
    application.partners = partners;
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store company details ', e);
  }
};

const storePartnerDetails = async ({ requestBody }) => {
  try {
    const applicationData = await Application.findById(
      requestBody.applicationId,
    ).lean();
    if (!applicationData) {
      return {
        status: 'ERROR',
        messageCode: 'NO_APPLICATION_FOUND',
        message: 'No application exists',
      };
    }
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
        message: 'Insufficient partners details',
      };
    }
    const promises = [];
    for (let i = 0; i < requestBody.partners.length; i++) {
      const update = {
        isDeleted: false,
      };
      let query = {};
      update.type = requestBody.partners[i].type.toLowerCase();
      update.debtorId = applicationData.debtorId;
      if (requestBody.partners[i].type.toLowerCase() === 'individual') {
        if (
          !requestBody.partners[i].title ||
          !requestBody.partners[i].firstName ||
          !requestBody.partners[i].lastName ||
          !requestBody.partners[i].dateOfBirth ||
          !requestBody.partners[i].address ||
          !requestBody.partners[i].address.state ||
          !requestBody.partners[i].address.postCode ||
          !requestBody.partners[i].address.streetName ||
          !requestBody.partners[i].address.streetType ||
          !requestBody.partners[i].address.suburb ||
          !requestBody.partners[i].address.streetNumber
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        query = {
          $or: [
            {
              driverLicenceNumber: requestBody.partners[i].driverLicenceNumber,
            },
            { dateOfBirth: requestBody.partners[i].dateOfBirth },
          ],
        };
        if (
          requestBody.partners[i].address &&
          Object.keys(requestBody.partners[i].address).length !== 0
        ) {
          update.residentialAddress = {
            property: requestBody.partners[i].address.property
              ? requestBody.partners[i].address.property
              : undefined,
            unitNumber: requestBody.partners[i].address.unitNumber
              ? requestBody.partners[i].address.unitNumber
              : undefined,
            streetNumber: requestBody.partners[i].address.streetNumber,
            streetName: requestBody.partners[i].address.streetName,
            streetType: requestBody.partners[i].address.streetType,
            suburb: requestBody.partners[i].address.suburb,
            state: requestBody.partners[i].address.state,
            country: requestBody.partners[i].address.country,
            postCode: requestBody.partners[i].address.postCode,
          };
        }
        update.title = requestBody.partners[i].title
          ? requestBody.partners[i].title
          : undefined;
        if (requestBody.partners[i].firstName)
          update.firstName = requestBody.partners[i].firstName;
        update.middleName = requestBody.partners[i].middleName
          ? requestBody.partners[i].middleName
          : undefined;
        if (requestBody.partners[i].lastName)
          update.lastName = requestBody.partners[i].lastName;
        if (requestBody.partners[i].dateOfBirth)
          update.dateOfBirth = requestBody.partners[i].dateOfBirth;
        if (requestBody.partners[i].driverLicenceNumber)
          update.driverLicenceNumber =
            requestBody.partners[i].driverLicenceNumber;
        if (requestBody.partners[i].phoneNumber)
          update.phoneNumber = requestBody.partners[i].phoneNumber;
        if (requestBody.partners[i].mobileNumber)
          update.mobileNumber = requestBody.partners[i].mobileNumber;
        if (requestBody.partners[i].email)
          update.email = requestBody.partners[i].email;
        if (requestBody.partners[i].hasOwnProperty('allowToCheckCreditHistory'))
          update.allowToCheckCreditHistory =
            requestBody.partners[i].allowToCheckCreditHistory;
      } else {
        if (
          !requestBody.partners[i].entityName ||
          !requestBody.partners[i].entityType ||
          (!requestBody.partners[i].abn && !requestBody.partners[i].acn)
        ) {
          return {
            status: 'ERROR',
            messageCode: 'REQUIRE_FIELD_MISSING',
            message: 'Require fields are missing',
          };
        }
        if (requestBody.partners[i].abn)
          update.abn = requestBody.partners[i].abn;
        if (requestBody.partners[i].acn)
          update.acn = requestBody.partners[i].acn;
        if (requestBody.partners[i].entityType)
          update.entityType = requestBody.partners[i].entityType;
        if (requestBody.partners[i].entityName)
          update.entityName = requestBody.partners[i].entityName;
        if (requestBody.partners[i].tradingName)
          update.tradingName = requestBody.partners[i].tradingName;
        query = {
          $or: [
            { abn: requestBody.partners[i].abn },
            { acn: requestBody.partners[i].acn },
          ],
        };
      }
      promises.push(DebtorDirector.updateOne(query, update, { upsert: true }));
    }
    promises.push(
      Application.updateOne(
        { _id: requestBody.applicationId },
        { applicationStage: 2 },
      ),
    );
    await Promise.all(promises);
    const application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
    return application;
  } catch (e) {
    Logger.log.error('Error occurred in store partners details ', e);
  }
};

const storeCreditLimitDetails = async ({ requestBody }) => {
  try {
    let application = await Application.findById(requestBody.applicationId)
      .populate({ path: 'debtorId', select: 'entityType' })
      .select('_id applicationStage debtorId')
      .lean();
    const entityTypes = ['TRUST', 'PARTNERSHIP'];
    const update = {
      creditLimit: requestBody.creditLimit,
      isExtendedPaymentTerms: requestBody.isExtendedPaymentTerms,
      isPassedOverdueAmount: requestBody.isPassedOverdueAmount,
      applicationStage: !entityTypes.includes(application.debtorId.entityType)
        ? 2
        : 3,
    };
    update.note = requestBody.note ? requestBody.note : '';
    update.extendedPaymentTermsDetails = requestBody.extendedPaymentTermsDetails
      ? requestBody.extendedPaymentTermsDetails
      : '';
    update.passedOverdueDetails = requestBody.passedOverdueDetails
      ? requestBody.passedOverdueDetails
      : '';
    await Application.updateOne({ _id: requestBody.applicationId }, update);
    application = await Application.findById(requestBody.applicationId)
      .select('_id applicationStage')
      .lean();
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
        response =
          individualCount >= 2 ||
          (individualCount >= 1 && companyCount >= 1) ||
          companyCount >= 2;
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
  getApplicationList,
  storeCompanyDetails,
  storePartnerDetails,
  storeCreditLimitDetails,
  partnerDetailsValidation,
};
