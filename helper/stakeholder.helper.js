/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getStakeholderDetails = async ({ stakeholder, manageColumns }) => {
  try {
    console.log('stakeholder ', stakeholder);
    console.log('manageColumns ', manageColumns);
    if (stakeholder.entityType) {
      stakeholder.entityType = stakeholder.entityType
        .replace(/_/g, ' ')
        .replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
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
        'country',
        'postCode',
      ];
      if (addressFields.includes(i.name)) {
        if (
          stakeholder['residentialAddress'] &&
          stakeholder['residentialAddress'][i.name]
        ) {
          response.push({
            label: i.label,
            value:
              i.name === 'country'
                ? stakeholder['residentialAddress']['country'][i.name]
                : stakeholder['residentialAddress'][i.name] || '',
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
            : stakeholder[i.name];
        if (i.name === 'allowToCheckCreditHistory') {
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
    let query = {};
    update.type = stakeholder.type.toLowerCase();
    update.debtorId = debtorId;
    if (stakeholder.type.toLowerCase() === 'individual') {
      if (
        stakeholder.address &&
        Object.keys(stakeholder.address).length !== 0
      ) {
        update.residentialAddress = {};
        if (
          stakeholder.address.property &&
          stakeholder.address.property.length !== 0
        ) {
          update.residentialAddress.property = stakeholder.address.property;
        }
        if (
          stakeholder.address.unitNumber &&
          stakeholder.address.unitNumber.length !== 0
        ) {
          update.residentialAddress.unitNumber = stakeholder.address.unitNumber;
        }
        if (
          stakeholder.address.streetNumber &&
          stakeholder.address.streetNumber.length !== 0
        ) {
          update.residentialAddress.streetNumber =
            stakeholder.address.streetNumber;
        }
        if (
          stakeholder.address.streetName &&
          stakeholder.address.streetName.length !== 0
        ) {
          update.residentialAddress.streetName = stakeholder.address.streetName;
        }
        if (
          stakeholder.address.streetType &&
          stakeholder.address.streetType.length !== 0
        ) {
          update.residentialAddress.streetType = stakeholder.address.streetType;
        }
        if (
          stakeholder.address.suburb &&
          stakeholder.address.suburb.length !== 0
        ) {
          update.residentialAddress.suburb = stakeholder.address.suburb;
        }
        if (
          stakeholder.address.state &&
          stakeholder.address.state.length !== 0
        ) {
          update.residentialAddress.state = stakeholder.address.state;
        }
        if (
          stakeholder.address.country &&
          stakeholder.address.country.name &&
          stakeholder.address.country.code
        ) {
          update.residentialAddress.country = stakeholder.address.country;
        }
        if (
          stakeholder.address.postCode &&
          stakeholder.address.postCode.length !== 0
        ) {
          update.residentialAddress.postCode = stakeholder.address.postCode;
        }
      }
      if (stakeholder.title) update.title = stakeholder.title;
      if (stakeholder.firstName) update.firstName = stakeholder.firstName;
      if (stakeholder.middleName) update.middleName = stakeholder.middleName;
      if (stakeholder.lastName) update.lastName = stakeholder.lastName;
      if (stakeholder.dateOfBirth) update.dateOfBirth = stakeholder.dateOfBirth;
      if (stakeholder.driverLicenceNumber)
        update.driverLicenceNumber = stakeholder.driverLicenceNumber;
      if (stakeholder.phoneNumber) update.phoneNumber = stakeholder.phoneNumber;
      if (stakeholder.mobileNumber)
        update.mobileNumber = stakeholder.mobileNumber;
      if (stakeholder.email) update.email = stakeholder.email;
      if (stakeholder.hasOwnProperty('allowToCheckCreditHistory'))
        update.allowToCheckCreditHistory =
          stakeholder.allowToCheckCreditHistory;
      query = {
        $or: [
          {
            driverLicenceNumber: stakeholder.driverLicenceNumber,
          },
          { dateOfBirth: stakeholder.dateOfBirth },
        ],
      };
    } else {
      if (stakeholder.abn) update.abn = stakeholder.abn;
      if (stakeholder.acn) update.acn = stakeholder.acn;
      if (stakeholder.entityType) update.entityType = stakeholder.entityType;
      if (stakeholder.entityName) update.entityName = stakeholder.entityName;
      if (stakeholder.tradingName) update.tradingName = stakeholder.tradingName;
      query = {
        $or: [{ abn: stakeholder.abn }, { acn: stakeholder.acn }],
      };
    }
    console.log('update ', update);
    return { query, update };
  } catch (e) {
    Logger.log.error(
      'Error occurred in store stakeholder details ',
      e.message || e,
    );
  }
};

module.exports = { getStakeholderDetails, storeStakeholderDetails };
