const path = require('path');
const fs = require('fs');
const csv = require('csvtojson');

const noteCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_note.csv',
  ),
);
const addressCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_address.csv',
  ),
);
const companyCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_company.csv',
  ),
);
const individualCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_individual.csv',
  ),
);
const applicationCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_request.csv',
  ),
);
const questionAnswerCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_req_question_answer.csv',
  ),
);
const approvedApplicationCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_tcr_application_approval_details.csv',
  ),
);
const applicationDetailsCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/processed_csv_files_2020-21/t_tcr_application_details.csv',
  ),
);
const activeClientCSV = fs.readFileSync(
  path.join(
    __dirname,
    '../../../Documents/TRAD/Illion Dump/Active-Client-List-28072021.csv',
  ),
);

const storeCSVFileAsJson = async ({ csvData }) => {
  try {
    const jsonArray = await csv().fromString(csvData);
    fs.writeFileSync('client.json', JSON.stringify(jsonArray, null, 3));
  } catch (e) {
    console.log('Error occurred in store file', e);
  }
};

const convertApplicationListToJson = async ({ csvData }) => {
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      if (
        jsonArray[i]['id_product_credit'] !== 'Overdues' &&
        jsonArray[i]['id_product_credit'] !== 'Claim'
      ) {
        const filteredData = jsonArray.filter(
          (obj) => obj['id_request'] === applicationId,
        );
        console.log('filtered data length', applicationId, filteredData.length);
        const filteredObject = {};
        filteredData.forEach((i) => {
          filteredObject[i.no_seq_request] = i;
        });
        processDone[jsonArray[i]['id_request']] = filteredObject;
      }
    }
  }
  fs.writeFileSync(
    'application-list-filtered.json',
    JSON.stringify(processDone, null, 3),
  );
};

const noteCSVToJson = async ({ csvData }) => {
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, filteredData.length);
      const filteredObject = {};
      filteredData.forEach((i) => {
        if (!filteredObject[i.no_seq_request]) {
          filteredObject[i.no_seq_request] = {};
        }
        filteredObject[i.no_seq_request][i.no_seq_note] = i;
        // filteredObject[i.no_seq_request] = i;
        // filteredObject[i.no_seq_request + '|' + i.cd_type] = i;
      });
      processDone[jsonArray[i]['id_request']] = filteredObject;
    }
  }
  fs.writeFileSync('notes.json', JSON.stringify(processDone, null, 3));
};

const csvToJson = async ({ csvData, fileName }) => {
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, filteredData.length);
      const filteredObject = {};
      filteredData.forEach((i) => {
        if (!filteredObject[i.no_seq_request]) {
          filteredObject[i.no_seq_request] = {};
        }
        filteredObject[i.no_seq_request][i.cd_type_applicant] = i;
        // filteredObject[i.no_seq_request] = i;
        // filteredObject[i.no_seq_request + '|' + i.cd_type] = i;
      });
      processDone[jsonArray[i]['id_request']] = filteredObject;
    }
  }
  fs.writeFileSync(fileName, JSON.stringify(processDone, null, 3));
};

const questionCSVToJson = async ({ csvData, fileName }) => {
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, filteredData.length);
      const filteredObject = {};
      filteredData.forEach((i) => {
        if (!filteredObject[i.no_seq_request]) {
          filteredObject[i.no_seq_request] = {};
        }
        filteredObject[i.no_seq_request][i.cd_type] = i;
      });
      processDone[jsonArray[i]['id_request']] = filteredObject;
    }
  }
  fs.writeFileSync(fileName, JSON.stringify(processDone, null, 3));
};

const applicationCsvToJson = async ({ csvData, fileName }) => {
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, filteredData.length);
      const filteredObject = {};
      filteredData.forEach((i) => {
        filteredObject[i.no_seq_request] = i;
      });
      processDone[jsonArray[i]['id_request']] = filteredObject;
    }
  }
  fs.writeFileSync(fileName, JSON.stringify(processDone, null, 3));
};

storeCSVFileAsJson({ csvData: activeClientCSV.toString() });
/*noteCSVToJson({ csvData: noteCSV.toString() });
csvToJson({ csvData: addressCSV.toString(), fileName: 'address-list.json' });
applicationCsvToJson({
  csvData: approvedApplicationCSV.toString(),
  fileName: 'application-approval-details.json',
});
applicationCsvToJson({
  csvData: applicationDetailsCSV.toString(),
  fileName: 'application-details.json',
});
csvToJson({ csvData: companyCSV.toString(), fileName: 'company-list.json' });
csvToJson({
  csvData: individualCSV.toString(),
  fileName: 'individual-list.json',
});
questionCSVToJson({
  csvData: questionAnswerCSV.toString(),
  fileName: 'question-answer.json',
});
convertApplicationListToJson({ csvData: applicationCSV.toString() });*/
