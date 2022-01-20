/*
 * Module Imports
 * */
const mongoose = require('mongoose');
const Client = mongoose.model('client');
const ClientUser = mongoose.model('client-user');

/*
 * Local Imports
 * */
const RssHelper = require('./helper/rss.helper');

let crmIds = [
  '8917',
  '12261',
  '8931',
  '8884',
  '11972',
  '8867',
  '8866',
  '11966',
  '12284',
  '8874',
  '8874',
  '10410',
  '8899',
  '8930',
  '8865',
  '8918',
  '8889',
  '8977',
  '8953',
  '8924',
  '8864',
  '8888',
  '8937',
  '11975',
  '8903',
  '8876',
  '8925',
  '8863',
  '12281',
  '8880',
  '12005',
  '8938',
  '8952',
  '8881',
  '8941',
  '8877',
  '8869',
  '8882',
  '8871',
  '8862',
  '8861',
  '8936',
  '8932',
  '8905',
  '8928',
  '8860',
  '8904',
  '8944',
  '11654',
  '8907',
  '8852',
  '8859',
  '8947',
  '8950',
  '9359',
  '8875',
  '8894',
  '8872',
  '8858',
  '8984',
  '8940',
  '8912',
  '8897',
  '8854',
  '9006',
  '8857',
  '12271',
  '8851',
  '8898',
  '8929',
  '8870',
  '8946',
  '8896',
  '10521',
  '8921',
  '10544',
  '8949',
  '8913',
  '8909',
  '12276',
  '8911',
  '11818',
  '12137',
  '8892',
  '8902',
  '11978',
  '11969',
  '8923',
  '8951',
  '11800',
  '8945',
  '12121',
  '8855',
  '8915',
  '8890',
  '9006',
  '10575',
  '11988',
  '12280',
  '12467',
];
let processedCrmId = [];
let main = async () => {
  crmIds = [...new Set(crmIds)];
  console.log('crmIds::', crmIds.length);
  const clientData = await RssHelper.getClientsById({
    crmIds: crmIds,
  });
  let promiseArr = [];
  console.log('clientData length', clientData.length);
  // process.exit(0)

  for (let i = 0; i < clientData.length; i++) {
    console.log('Processing for client index', i);
    processedCrmId.push(clientData[i].crmClientId);
    const client = new Client(clientData[i]);
    const insurer = await RssHelper.fetchInsurerDetails({
      underwriterName: clientData[i].underWriter,
      crmClientId: clientData[i].crmClientId,
      clientId: client._id,
      auditLog: { userType: 'user', userRefId: '6035f169f30c50fec2f70d7e' },
    });
    client.insurerId = insurer && insurer._id ? insurer._id : null;
    const contactsFromCrm = await RssHelper.getClientContacts({
      clientId: clientData[i].crmClientId,
      page: 1,
      limit: 50,
    });
    contactsFromCrm.forEach((crmContact) => {
      let clientUser = new ClientUser(crmContact);
      clientUser.clientId = client._id;
      promiseArr.push(clientUser.save());
    });
    promiseArr.push(client.save());
  }
  await Promise.all(promiseArr);
  console.log('successfully fetched all the clients...');
  console.log('processedCrmId::', processedCrmId);
};
main();
