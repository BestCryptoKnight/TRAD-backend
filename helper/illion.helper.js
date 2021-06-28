const axios = require('axios');
var parser = require('xml2json');
const mongoose = require('mongoose');
const Organization = mongoose.model('organization');
/*
 * Local Imports
 * */
const Logger = require('./../services/logger');
let config = require('./../config');

let fetchCreditReport = ({ productCode, searchField, searchValue }) => {
  return new Promise(async (resolve, reject) => {
    try {
      // productCode = 'HXBCA';
      // searchField = 'ABN';
      // searchValue = '51069691676';
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
      let xmlBody = `
<x:Envelope xmlns:x="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.dnb.com.au/Schema/CommercialBureau">
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
      // fs.writeFileSync('hxbca1.json', jsonData);
      return resolve(processedReport);
    } catch (e) {
      console.log('Error in getting entity details from lookup');
      console.log(e.message || e);
      return reject(e);
    }
  });
};
// fetchCreditReport({});
// let report = null;

let processObj = (obj) => {
  let processedObject = {};
  Object.keys(obj).forEach((key) => {
    let processedKey = key;
    if (processedKey.includes(':')) {
      processedKey = processedKey.split(':')[1];
    }
    if (typeof obj[key] === 'object' && obj[key].length === undefined) {
      processedObject[processedKey] = processObj(obj[key]);
      if (obj[key].hasOwnProperty('Year')) {
        processedObject[processedKey + 'Str'] = processDate(obj[key]);
      }
    } else if (typeof obj[key] === 'object' && obj[key].length > 0) {
      processedObject[processedKey] = [];
      obj[key].forEach((subObj) => {
        if (typeof subObj === 'object' && subObj.length === undefined) {
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
  let dt = new Date(obj['Year'], parseInt(obj['Month']) - 1, obj['Day']);
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
    if (typeof report[key] === 'object' && report[key].length === undefined) {
      processedReport[processedKey] = processObj(report[key]);
      if (
        report[key].hasOwnProperty('Year') &&
        report[key].hasOwnProperty('Month') &&
        report[key].hasOwnProperty('Day')
      ) {
        processedReport[processedKey + 'Str'] = processDate(report[key]);
      }
    } else {
      processedReport[processedKey] = report[key];
    }
  });
  return processedReport;
};

// processIllionReport();

module.exports = {
  fetchCreditReport,
};
