/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const DebtorDirector = mongoose.model('debtor-director');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
const { formatString } = require('./overdue.helper');
const { getDebtorFullAddress } = require('./debtor.helper');
const StaticData = require('./../static-files/staticData.json');

const getStakeholderDetails = async ({ stakeholderId, manageColumns }) => {
  try {
    const stakeholder = await DebtorDirector.findById(stakeholderId)
      .select({ __v: 0, isDeleted: 0 })
      .lean();
    if (!stakeholder) {
      return {
        status: 'ERROR',
        messageCode: 'NO_STAKEHOLDER_FOUND',
        message: 'No stakeholder found',
      };
    }
    if (stakeholder.entityType) {
      stakeholder.entityType = formatString(stakeholder.entityType);
    }
    let response = [];
    let value = '';
    manageColumns.forEach((i) => {
      i.name =
        i.name === 'name'
          ? stakeholder.type === 'individual'
            ? 'individualName'
            : 'entityName'
          : i.name;
      const addressFields = [
        'property',
        'unitNumber',
        'streetNumber',
        'streetName',
        'streetType',
        'suburb',
        'state',
        'postCode',
      ];
      if (addressFields.includes(i.name)) {
        if (
          stakeholder['residentialAddress'] &&
          stakeholder['residentialAddress'][i.name]
        ) {
          response.push({
            label: i.label,
            value: stakeholder['residentialAddress'][i.name] || '',
            type: i.type,
          });
        }
      } else {
        value =
          i.name === 'individualName' && stakeholder.type === 'individual'
            ? (
                (stakeholder.firstName ? stakeholder.firstName + ' ' : '') +
                (stakeholder.middleName ? stakeholder.middleName + ' ' : '') +
                (stakeholder.lastName ? stakeholder.lastName : '')
              ).trim()
            : i.name === 'country'
            ? stakeholder[i.name]['name']
            : stakeholder[i.name];
        if (
          i.name === 'allowToCheckCreditHistory' &&
          stakeholder.type === 'individual'
        ) {
          value = value ? 'Yes' : 'No';
        }
        if (value) {
          response.push({
            label: i.label,
            value: value || '',
            type: i.type,
          });
        }
      }
    });
    return response;
  } catch (e) {
    Logger.log.error(
      'Error occurred in get client-debtor details ',
      e.message || e,
    );
  }
};

const storeStakeholderDetails = async ({ stakeholder, debtorId }) => {
  try {
    const update = {
      isDeleted: false,
    };
    let unsetFields = {};
    let query = {};
    update.type = stakeholder.type.toLowerCase();
    update.debtorId = debtorId;
    if (stakeholder.type.toLowerCase() === 'individual') {
      if (
        stakeholder.address &&
        Object.keys(stakeholder.address).length !== 0
      ) {
        update.residentialAddress = {};
        update.residentialAddress.property = stakeholder.address.property
          ? stakeholder.address.property
          : undefined;
        update.residentialAddress.unitNumber = stakeholder.address.unitNumber
          ? stakeholder.address.unitNumber
          : undefined;
        update.residentialAddress.streetNumber = stakeholder.address
          .streetNumber
          ? stakeholder.address.streetNumber
          : undefined;
        update.residentialAddress.streetName = stakeholder.address.streetName
          ? stakeholder.address.streetName
          : undefined;
        update.residentialAddress.streetType = stakeholder.address.streetType
          ? stakeholder.address.streetType
          : undefined;
        update.residentialAddress.suburb = stakeholder.address.suburb
          ? stakeholder.address.suburb
          : undefined;
        update.residentialAddress.state = stakeholder.address.state
          ? stakeholder.address.state
          : undefined;
        if (
          stakeholder.address.country &&
          stakeholder.address.country.name &&
          stakeholder.address.country.code
        ) {
          update.country = stakeholder.address.country;
        }
        update.residentialAddress.postCode = stakeholder.address.postCode
          ? stakeholder.address.postCode
          : undefined;
      }
      if (stakeholder.title) update.title = stakeholder.title;
      if (stakeholder.firstName) update.firstName = stakeholder.firstName;
      update.middleName = stakeholder.middleName
        ? stakeholder.middleName
        : undefined;
      if (stakeholder.lastName) update.lastName = stakeholder.lastName;
      if (stakeholder.dateOfBirth) update.dateOfBirth = stakeholder.dateOfBirth;
      if (stakeholder.driverLicenceNumber)
        update.driverLicenceNumber = stakeholder.driverLicenceNumber;
      update.phoneNumber = stakeholder.phoneNumber
        ? stakeholder.phoneNumber
        : undefined;
      update.mobileNumber = stakeholder.mobileNumber
        ? stakeholder.mobileNumber
        : undefined;
      update.email = stakeholder.email ? stakeholder.email : undefined;
      if (stakeholder.hasOwnProperty('allowToCheckCreditHistory'))
        update.allowToCheckCreditHistory =
          stakeholder.allowToCheckCreditHistory;
      query = {
        debtorId: debtorId,
        $or: [
          {
            driverLicenceNumber: stakeholder.driverLicenceNumber,
          },
          { dateOfBirth: stakeholder.dateOfBirth },
        ],
      };
      unsetFields = {
        abn: 1,
        acn: 1,
        entityType: 1,
        entityName: 1,
        tradingName: 1,
        registrationNumber: 1,
      };
    } else {
      if (stakeholder.abn) update.abn = stakeholder.abn;
      update.acn = stakeholder.acn ? stakeholder.acn : undefined;
      update.registrationNumber = stakeholder.registrationNumber
        ? stakeholder.registrationNumber
        : undefined;
      if (stakeholder.entityType) update.entityType = stakeholder.entityType;
      if (stakeholder.entityName) update.entityName = stakeholder.entityName;
      update.tradingName = stakeholder.tradingName
        ? stakeholder.tradingName
        : undefined;
      if (stakeholder.stakeholderCountry)
        update.country = stakeholder.stakeholderCountry;

      query = {
        debtorId: debtorId,
      };
      if (stakeholder.registrationNumber) {
        query.registrationNumber = stakeholder.registrationNumber;
      } else if (stakeholder.abn) {
        query.abn = stakeholder.abn;
      } else {
        query.acn = stakeholder.acn;
      }
      unsetFields = {
        title: 1,
        firstName: 1,
        middleName: 1,
        lastName: 1,
        dateOfBirth: 1,
        driverLicenceNumber: 1,
        residentialAddress: 1,
        phoneNumber: 1,
        mobileNumber: 1,
        email: 1,
        allowToCheckCreditHistory: 1,
      };
    }
    return { query, update, unsetFields };
  } catch (e) {
    Logger.log.error(
      'Error occurred in store stakeholder details ',
      e.message || e,
    );
  }
};

const getStakeholderList = async ({
  debtorId,
  stakeholderColumn,
  manageColumns,
  requestedQuery,
}) => {
  try {
    if (stakeholderColumn.includes('name')) {
      stakeholderColumn.push('entityName');
      stakeholderColumn.push('firstName');
      stakeholderColumn.push('middleName');
      stakeholderColumn.push('lastName');
    }
    let queryFilter = {
      isDeleted: false,
      debtorId: mongoose.Types.ObjectId(debtorId),
    };
    const sortingOptions = {};
    requestedQuery.sortBy = requestedQuery.sortBy || '_id';
    requestedQuery.sortOrder = requestedQuery.sortOrder || 'desc';
    sortingOptions[requestedQuery.sortBy] = requestedQuery.sortOrder;
    /*if (requestedQuery.search) {
      queryFilter = Object.assign({}, queryFilter, {
        $expr: {
          $or: [
            {
              $regexMatch: {
                input: {
                  $concat: ['$firstName', ' ', '$middleName', ' ', '$lastName'],
                },
                regex: requestedQuery.search,
                options: 'i',
              },
            },
            {
              $regexMatch: {
                input: '$entityName',
                regex: requestedQuery.search,
                options: 'i',
              },
            }
          ],
        },
      });
      // queryFilter.name = { $regex: requestedQuery.search, $options: 'i' }
    }*/

    const option = {
      page: parseInt(requestedQuery.page) || 1,
      limit: parseInt(requestedQuery.limit) || 5,
    };
    option.select =
      stakeholderColumn.toString().replace(/,/g, ' ') +
      ' residentialAddress type';
    option.sort = sortingOptions;
    option.lean = true;
    const responseObj = await DebtorDirector.paginate(queryFilter, option);
    responseObj.headers = [];
    for (let i = 0; i < manageColumns.length; i++) {
      if (stakeholderColumn.includes(manageColumns[i].name)) {
        responseObj.headers.push(manageColumns[i]);
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
          if (stakeholderColumn.includes('property')) {
            stakeholder.property = stakeholder.residentialAddress.property;
          }
          if (stakeholderColumn.includes('unitNumber')) {
            stakeholder.unitNumber = stakeholder.residentialAddress.unitNumber;
          }
          if (stakeholderColumn.includes('streetNumber')) {
            stakeholder.streetNumber =
              stakeholder.residentialAddress.streetNumber;
          }
          if (stakeholderColumn.includes('streetName')) {
            stakeholder.streetName = stakeholder.residentialAddress.streetName;
          }
          if (stakeholderColumn.includes('streetType')) {
            const streetType = StaticData.streetType.find((i) => {
              if (i._id === stakeholder.residentialAddress.streetType) return i;
            });
            stakeholder.streetType =
              streetType && streetType.name
                ? streetType.name
                : stakeholder.residentialAddress.streetType;
          }
          if (stakeholderColumn.includes('suburb')) {
            stakeholder.suburb = stakeholder.residentialAddress.suburb;
          }
          if (stakeholderColumn.includes('state')) {
            stakeholder.state = stakeholder.residentialAddress.state;
          }
          if (stakeholderColumn.includes('postCode')) {
            stakeholder.postCode = stakeholder.residentialAddress.postCode;
          }
          if (stakeholderColumn.includes('fullAddress')) {
            stakeholder.fullAddress = getDebtorFullAddress({
              address: stakeholder.residentialAddress,
              country: stakeholder.country,
            });
          }
          if (stakeholder.hasOwnProperty('allowToCheckCreditHistory')) {
            stakeholder.allowToCheckCreditHistory = stakeholder.allowToCheckCreditHistory
              ? 'Yes'
              : 'No';
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
            stakeholder.entityType = formatString(stakeholder.entityType);
          }
        }
        if (stakeholder.country) {
          stakeholder.country = stakeholder.country.name;
        }
        delete stakeholder.type;
        delete stakeholder.id;
      });
    }
    return responseObj;
  } catch (e) {
    Logger.log.error('Error occurred in get stakeholder list');
    Logger.log.error(e.message || e);
  }
};

module.exports = {
  getStakeholderDetails,
  storeStakeholderDetails,
  getStakeholderList,
};
