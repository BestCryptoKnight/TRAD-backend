const axios = require('axios');
const convert = require('xml-js');
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
      // productCode = 'UEBV';
      // searchField = 'ABN';
      // searchValue = '38881083819';
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
      const jsonData = convert.xml2js(data);
      Logger.log.info('Successfully received report at', new Date());

      // console.log('converted JSON::', JSON.stringify(jsonData, null, 3));
      // fs.writeFileSync('uebv.json', JSON.stringify(jsonData));
      return resolve(jsonData);
    } catch (e) {
      console.log('Error in getting entity details from ABN');
      console.log(e.message || e);
      return reject(e);
    }
  });
};

module.exports = {
  fetchCreditReport,
};
