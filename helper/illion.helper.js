const axios = require('axios');
const convert = require('xml-js');
let config = require('./../helper/illion.helper');

let fetchCreditReport = () => {
  return new Promise(async (resolve, reject) => {
    try {
      let xmlBody = `<x:Envelope xmlns:x="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.dnb.com.au/Schema/CommercialBureau">
               <x:Header/>
               <x:Body>
               <com:Request>
               <com:RequestHeader>
               <com:Version>1.0</com:Version>
               <com:Subscriber>
               <com:SubscriberId>940781772</com:SubscriberId>
               <com:UserId>001016</com:UserId>
               <com:Password>123456</com:Password>
               </com:Subscriber>
               <com:ProductCode>HXBCA</com:ProductCode>
               <com:Environment>T</com:Environment>
               <com:CustomerReference>
               <com:BillingReference>TEST</com:BillingReference>
               <com:Contact>TEST</com:Contact>
               </com:CustomerReference>
               </com:RequestHeader>
               <com:RequestDetails>
                   <com:LookupMethod>ABN</com:LookupMethod>
                   <com:LookupValue>51069691676</com:LookupValue>
               </com:RequestDetails>
               </com:Request>
               </x:Body>              
               </x:Envelope>`;
      const url = `https://b2btest.dnb.com.au/CBB2BService/CBB2BService.asmx`;
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'text/soap+xml;charset=utf-8',
        },
      };
      let { data } = await axios.post(url, xmlBody, options);
      const jsonData = convert.xml2js(data);
      console.log('converted JSON::', JSON.stringify(jsonData, null, 3));
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
