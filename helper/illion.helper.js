/*
 * Module Imports
 * */
const axios = require('axios');
const parser = require('xml2json');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');

/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
let config = require('./../config');

/*
Fetch Credit Report
 */
const fetchCreditReport = ({ productCode, searchField, searchValue }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      })
        .select({ 'integration.illion': 1 })
        .lean();
      if (
        !organization ||
        !organization.integration ||
        !organization.integration.illion ||
        !organization.integration.illion.userId ||
        !organization.integration.illion.subscriberId ||
        !organization.integration.illion.password
      ) {
        Logger.log.error('ILLION_CREDENTIALS_NOT_PRESENT');
        return reject({ message: 'ILLION_CREDENTIALS_NOT_PRESENT' });
      }
      let xmlBody = `<x:Envelope xmlns:x="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.dnb.com.au/Schema/CommercialBureau">
    <x:Header/>
    <x:Body>
        <com:Request>
            <com:RequestHeader>
                <com:Version>1.0</com:Version>
                <com:Subscriber>
                    <com:SubscriberId>${organization.integration.illion.subscriberId}</com:SubscriberId>
                    <com:UserId>${organization.integration.illion.userId}</com:UserId>
                    <com:Password>${organization.integration.illion.password}</com:Password>
                </com:Subscriber>
                <com:ProductCode>${productCode}</com:ProductCode>
                <com:Environment>${config.illion.environment}</com:Environment>
                <com:CustomerReference>
                </com:CustomerReference>
            </com:RequestHeader>
            <com:RequestDetails>
                 <com:LookupMethod>${searchField}</com:LookupMethod>
                 <com:LookupValue>${searchValue}</com:LookupValue>
            </com:RequestDetails>
        </com:Request>
    </x:Body>              
</x:Envelope>`;
      const url = config.illion.apiUrl;
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'text/soap+xml;charset=utf-8',
        },
      };
      Logger.log.info('Making a request to illion at', new Date());
      let { data } = await axios.post(url, xmlBody, options);
      Logger.log.info('Successfully received report at', new Date());
      let jsonData = parser.toJson(data);
      jsonData = JSON.parse(jsonData);
      const processedReport = processIllionReport(jsonData);
      return resolve(processedReport);
    } catch (e) {
      Logger.log.error('Error in getting entity details from lookup');
      Logger.log.error(e.message || e);
      return reject(e);
    }
  });
};

let processObj = (obj) => {
  let processedObject = {};
  Object.keys(obj).forEach((key) => {
    let processedKey = key;
    if (processedKey.includes(':')) {
      processedKey = processedKey.split(':')[1];
    }
    if (
      obj[key] &&
      typeof obj[key] === 'object' &&
      obj[key].length === undefined
    ) {
      processedObject[processedKey] = processObj(obj[key]);
      if (
        obj[key].hasOwnProperty('Year') &&
        (obj[key].hasOwnProperty('Month') ||
          obj[key].hasOwnProperty('MonthSpecified')) &&
        (obj[key].hasOwnProperty('Day') ||
          obj[key].hasOwnProperty('DaySpecified'))
      ) {
        processedObject[processedKey + 'Str'] = processDate(obj[key]);
      }
    } else if (
      obj[key] &&
      typeof obj[key] === 'object' &&
      obj[key].length > 0
    ) {
      processedObject[processedKey] = [];
      obj[key].forEach((subObj) => {
        if (
          subObj &&
          typeof subObj === 'object' &&
          subObj.length === undefined
        ) {
          processedObject[processedKey].push(processObj(subObj));
        }
      });
    } else {
      processedObject[processedKey] = obj[key];
    }
  });
  return processedObject;
};

let processDate = (obj) => {
  let dt = new Date(
    obj['Year'],
    obj['Month'] ? parseInt(obj['Month']) - 1 : 0,
    obj['Day'] ? obj['Day'] : 1,
  );
  if (
    obj.hasOwnProperty('Hour') &&
    obj.hasOwnProperty('Minute') &&
    obj.hasOwnProperty('Second')
  )
    dt.setHours(obj['Hour'], obj['Minute'], obj['Second']);
  return dt;
};

let processIllionReport = (report) => {
  let processedReport = {};
  Object.keys(report).forEach((key) => {
    let processedKey = key;
    if (processedKey.includes(':')) {
      processedKey = processedKey.split(':')[1];
    }
    if (
      report[key] &&
      typeof report[key] === 'object' &&
      report[key].length === undefined
    ) {
      processedReport[processedKey] = processObj(report[key]);
      if (
        report[key].hasOwnProperty('Year') &&
        (report[key].hasOwnProperty('Month') ||
          report[key].hasOwnProperty('MonthSpecified')) &&
        (report[key].hasOwnProperty('Day') ||
          report[key].hasOwnProperty('DaySpecified'))
      ) {
        processedReport[processedKey + 'Str'] = processDate(report[key]);
      }
    } else {
      processedReport[processedKey] = report[key];
    }
  });
  return processedReport;
};

const fetchCreditReportInPDFFormat = ({
  productCode,
  searchField,
  searchValue,
  countryCode,
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const organization = await Organization.findOne({
        isDeleted: false,
      })
        .select({ 'integration.illion': 1 })
        .lean();
      if (
        !organization ||
        !organization.integration ||
        !organization.integration.illion ||
        !organization.integration.illion.userId ||
        !organization.integration.illion.subscriberId ||
        !organization.integration.illion.password
      ) {
        Logger.log.error('ILLION_CREDENTIALS_NOT_PRESENT');
        return Promise.reject({ message: 'ILLION_CREDENTIALS_NOT_PRESENT' });
      }

      countryCode = countryCode === 'AUS' ? 'AU' : 'NZ';
      const requestBody = JSON.stringify({
        FinancialReportOptions: { FinancialYear: '9999' },
        Request: {
          RequestHeader: {
            Version: '1.1',
            Subscriber: {
              SubscriberId: organization.integration.illion.subscriberId,
              UserId: organization.integration.illion.userId,
              Password: organization.integration.illion.password,
            },
            ProductCode: productCode,
            Environment: config.illion.environment,
            CustomerReference: { BillingReference: 'TEST', Contact: 'TEST' },
          },
          RequestDetails: {
            CountryCode: countryCode,
            LookupMethod: searchField,
            LookupValue: searchValue,
          },
        },
        ReportOption: { ReportFormat: '2' },
      });
      const options = {
        method: 'post',
        url: config.illion.pdfReportAPIUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        data: requestBody,
      };
      Logger.log.info('Options..', options);
      Logger.log.info('Making a request to illion at', new Date());
      const { data } = await axios(options);
      Logger.log.info('PDF Report fetched at', new Date());
      return resolve(processIllionReport(data));
    } catch (e) {
      Logger.log.error('Error occurred in fetch PDF report', e);
      return reject(e.message || e);
    }
  });
};

/*
Create Profile for Alert
 */
const createProfile = async ({ illionAlert, alertIds, profileName }) => {
  try {
    const url = `${config.illion.alertAPIUrl}api/Profile/CreateProfile`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: illionAlert.subscriberId,
          userId: illionAlert.userId,
          password: illionAlert.password,
        },
      },
      profileName: profileName,
      profileColour: 'None',
      alertIds: alertIds,
      useInternalReferenceNumber: false,
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in create illion profile');
    Logger.log.error(e.message || e);
  }
};

/*
Update Alert Profile
 */
const updateProfile = async ({ requestedData }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1 })
      .lean();
    const url = `${config.illion.alertAPIUrl}api/Profile/UpdateProfile`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: organization.integration.illionAlert.subscriberId,
          userId: organization.integration.illionAlert.userId,
          password: organization.integration.illionAlert.password,
        },
      },
      profileId: requestedData.profileId,
      profileName: requestedData.profileName,
      profileColour: requestedData.profileColour,
      locked: requestedData.locked,
      profileAlerts: requestedData.profileAlerts,
      useInternalReferenceNumber: requestedData.useInternalReferenceNumber,
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in update illion profile');
    Logger.log.error(e.message || e);
  }
};

/*
Subscribe Alert Profile
 */
const subscribeProfile = async ({ requestedData }) => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1, illionAlertProfile: 1 })
      .lean();
    const url = `${config.illion.alertAPIUrl}api/Profile/SubscribeProfile`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: organization.integration.illionAlert.subscriberId,
          userId: organization.integration.illionAlert.userId,
          password: organization.integration.illionAlert.password,
        },
      },
      profileId: organization.illionAlertProfile.profileId,
      userConfiguration: {
        email: requestedData.email,
      },
      'userConfiguration/profileEmailNotificationType': {
        realtimeEmail: requestedData.profileEmailNotificationType.realtimeEmail,
        dailySummary: requestedData.profileEmailNotificationType.dailySummary,
        weeklySummary: requestedData.profileEmailNotificationType.weeklySummary,
      },
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in subscribe profile');
    Logger.log.error(e);
  }
};

/*
Unsubscribe Alert Profile
 */
const unSubscribeProfile = async () => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1, illionAlertProfile: 1 })
      .lean();
    const url = `${config.illion.alertAPIUrl}api/Profile/UnsubscribeProfile`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: organization.integration.illionAlert.subscriberId,
          userId: organization.integration.illionAlert.userId,
          password: organization.integration.illionAlert.password,
        },
      },
      profileId: organization.illionAlertProfile.profileId,
      userConfiguration: {
        email: organization.illionAlertProfile.email,
      },
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in subscribe profile');
    Logger.log.error(e);
  }
};

/*
Get Alert Profiles
 */
const getProfiles = async () => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1 })
      .lean();
    const url = `${config.illion.alertAPIUrl}api/Profile/ProfileDetails`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: organization.integration.illionAlert.subscriberId,
          userId: organization.integration.illionAlert.userId,
          password: organization.integration.illionAlert.password,
        },
      },
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in get alert profiles');
    Logger.log.error(e);
  }
};

/*
Add Entities to Alert Profile
 */
const addEntitiesToProfile = async ({ entities, integration }) => {
  try {
    const url = `${config.illion.alertAPIUrl}api/Entities/AddEntities`;
    const requestBody = JSON.stringify({
      requestHeader: {
        subscriber: {
          subscriberId: integration.illionAlert.subscriberId,
          userId: integration.illionAlert.userId,
          password: integration.illionAlert.password,
        },
      },
      billingHeader: {
        billingReference: 'TRAD@2021',
        contact: 'TRAD@2021',
      },
      entities: entities,
    });
    const options = {
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in add entities in alert profile');
    Logger.log.error(e);
  }
};

/*
Get Monitored Entities
 */
const getMonitoredEntities = async () => {
  try {
    const organization = await Organization.findOne({
      isDeleted: false,
    })
      .select({ 'integration.illionAlert': 1, illionAlertProfile: 1 })
      .lean();
    const url = `${config.illion.alertAPIUrl}api/Entities/GetMonitoredEntities`;
    const requestBody = JSON.stringify({
      requestHeader: {
        subscriber: {
          subscriberId: organization.integration.illionAlert.subscriberId,
          userId: organization.integration.illionAlert.userId,
          password: organization.integration.illionAlert.password,
        },
      },
      profileId: organization.illionAlertProfile.profileId,
    });
    const options = {
      method: 'post',
      url: url,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in get monitored entities from profile');
    Logger.log.error(e.response.data || e);
  }
};

/*
Remove Entity from Profile
 */
const removeEntitiesFromProfile = async ({ entities, integration }) => {
  try {
    const url = `${config.illion.alertAPIUrl}api/Entities/RemoveEntityFromProfile`;
    const requestBody = JSON.stringify({
      requestHeader: {
        subscriber: {
          subscriberId: integration.illionAlert.subscriberId,
          userId: integration.illionAlert.userId,
          password: integration.illionAlert.password,
        },
      },
      billingHeader: {
        billingReference: 'TRAD@2021',
        contact: 'TRAD@2021',
      },
      entities: entities,
    });
    const options = {
      method: 'DELETE',
      url: url,
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in get monitored entities');
    Logger.log.error(e);
  }
};

/*
Retrieve Alert list
 */
const retrieveAlertList = async ({
  startDate,
  endDate,
  integration,
  illionAlertProfile,
}) => {
  try {
    const url = `${config.illion.alertAPIUrl}api/Profile/AlertList`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: integration.illionAlert.subscriberId,
          userId: integration.illionAlert.userId,
          password: integration.illionAlert.password,
        },
      },
      profileId: illionAlertProfile.profileId,
      alertFromDate: startDate,
      alertToDate: endDate,
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in retrieve alert list');
    Logger.log.error(e);
  }
};

/*
Retrieve Detailed Alert list
 */
const retrieveDetailedAlertList = async ({
  startDate,
  endDate,
  monitoringArray,
  integration,
  illionAlertProfile,
}) => {
  try {
    const url = `${config.illion.alertAPIUrl}api/Profile/DetailedAlertList`;
    const requestBody = {
      requestHeader: {
        subscriber: {
          subscriberId: integration.illionAlert.subscriberId,
          userId: integration.illionAlert.userId,
          password: integration.illionAlert.password,
        },
      },
      profileId: illionAlertProfile.profileId,
      alertFromDate: startDate,
      alertToDate: endDate,
      productMonitoring: monitoringArray,
    };
    const options = {
      method: 'POST',
      url: url,
      data: requestBody,
    };
    const { data } = await axios(options);
    return data;
  } catch (e) {
    Logger.log.error('Error occurred in retrieve detailed alert list');
    Logger.log.error(e);
  }
};

module.exports = {
  createProfile,
  updateProfile,
  retrieveAlertList,
  retrieveDetailedAlertList,
  getProfiles,
  subscribeProfile,
  unSubscribeProfile,
  addEntitiesToProfile,
  getMonitoredEntities,
  removeEntitiesFromProfile,
  fetchCreditReportInPDFFormat,
};
