const axios = require('axios');
const convert = require('xml-js');
var parser = require('xml2json');
const fs = require('fs');
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
      productCode = 'HXBCA';
      searchField = 'ABN';
      searchValue = '51069691676';
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
      // console.log(url, xmlBody, options);
      let { data } = await axios.post(url, xmlBody, options);
      Logger.log.info('Successfully received report at', new Date());
      const jsonData = parser.toJson(data);
      Logger.log.info('Successfully received report at', new Date());

      // console.log('converted JSON::', jsonData);
      console.log(
        'converted JSON::',
        JSON.stringify(JSON.parse(jsonData), null, 3),
      );
      fs.writeFileSync('hxbca1.json', jsonData);
      return resolve(jsonData);
    } catch (e) {
      console.log('Error in getting entity details from ABN');
      console.log(e.message || e);
      return reject(e);
    }
  });
};
// fetchCreditReport({});
// let report = null;

let processObj = (obj) => {
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === 'object' && obj[key].length === undefined) {
      console.log('Calling for::', key);
      obj[key] = processObj(obj[key]);
      if (obj[key].hasOwnProperty('Year')) {
        obj[key + 'Str'] = processDate(obj[key]);
      }
      console.log('Processed for::', key);
    } else if (typeof obj[key] === 'object' && obj[key].length > 0) {
      console.log('Calling for::', key);
      obj[key].forEach((subObj) => {
        if (typeof subObj === 'object' && subObj.length === undefined) {
          subObj = processObj(subObj);
        }
      });
    }
    console.log('returning object::');
  });
  return obj;
};

let processDate = (obj) => {
  console.log('OBJ in DATE::', obj);
  if (
    !obj.hasOwnProperty('Year') ||
    !obj.hasOwnProperty('Month') ||
    !obj.hasOwnProperty('Day')
  )
    return '';
  let dt = new Date(obj['Year'], parseInt(obj['Month']) - 1, obj['Day']);
  if (
    obj.hasOwnProperty('Hour') &&
    obj.hasOwnProperty('Minute') &&
    obj.hasOwnProperty('Second')
  )
    dt.setHours(obj['Hour'], obj['Minute'], obj['Second']);
  console.log('Converted Date::', dt);
  return dt;
};

let processIllionReport = (report) => {
  report = fs.readFileSync('hxbca1.json', 'utf8');
  report = JSON.parse(report);
  console.log(typeof report);
  console.log(JSON.stringify(report, null, 3));
  Object.keys(report).forEach((key) => {
    if (typeof report[key] === 'object' && report[key].length === undefined) {
      console.log('Calling for::', key);
      report[key] = processObj(report[key]);
      console.log('Processed for::', key, report[key]);
      if (report[key].hasOwnProperty('Year')) {
        report[key + 'Str'] = processDate(report[key]);
      }
    }
    // console.log('report[key] after::', report[key]);
  });
  console.log('Illion report processed::', JSON.stringify(report, null, 3));
  // report['soap:Envelope']
};

processIllionReport();

module.exports = {
  fetchCreditReport,
};
