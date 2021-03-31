/*
 * Local Imports
 * */
const Logger = require('./../services/logger');

const getClientDebtorDetails = async ({ debtor, manageColumns }) => {
  try {
    if (debtor.debtorId && debtor.debtorId.entityType) {
      debtor.debtorId.entityType = debtor.debtorId.entityType
        .replace(/_/g, ' ')
        .replace(/\w\S*/g, function (txt) {
          return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    let response = [];
    let value = '';
    manageColumns.forEach((i) => {
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
        response.push({
          label: i.label,
          value:
            i.name === 'country'
              ? debtor['debtorId']['address']['country'][i.name]
              : debtor['debtorId']['address'][i.name] || '',
          type: i.type,
        });
      } else {
        value =
          i.name === 'creditLimit' ||
          i.name === 'createdAt' ||
          i.name === 'updatedAt'
            ? debtor[i.name]
            : debtor['debtorId'][i.name];
        if (i.name === 'isActive') {
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

module.exports = { getClientDebtorDetails };
