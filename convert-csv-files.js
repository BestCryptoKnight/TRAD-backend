const path = require('path');
const fs = require('fs');
const csv = require('csvtojson');
const inputFilePath = [__dirname, '..', 'illion_dump_files', 'output_files_2021', 'processed_csv_files_2021'];
const outputFilePath = [__dirname, '..', 'illion_dump_files', 'output_files_2021'];

const noteCSV = fs.readFileSync(
  path.join(
      ...inputFilePath, 't_req_note.csv',
  ),
);
const addressCSV = fs.readFileSync(
  path.join(...inputFilePath, 't_req_address.csv'),
);
const companyCSV = fs.readFileSync(
  path.join(...inputFilePath, 't_req_company.csv',
  ),
);
const individualCSV = fs.readFileSync(
  path.join(
      ...inputFilePath, 't_req_individual.csv',
  ),
);
const applicationCSV = fs.readFileSync(
  path.join(
    ...inputFilePath,
    't_req_request.csv',
  ),
);
const questionAnswerCSV = fs.readFileSync(
  path.join(
    ...inputFilePath,
    't_req_question_answer.csv',
  ),
);
const approvedApplicationCSV = fs.readFileSync(
  path.join(
    ...inputFilePath,
    't_tcr_application_approval_details.csv',
  ),
);
const applicationDetailsCSV = fs.readFileSync(
  path.join(
    ...inputFilePath,
    't_tcr_application_details.csv',
  ),
);
// const activeClientCSV = fs.readFileSync(
//   path.join(
//     ...inputFilePath,
//     'Active-Client-List-28072021.csv',
//   ),
// );

/*Stores CSV file of Client in JSON - one time for the Client - Client Code */
const storeCSVFileAsJson = async ({ csvData }) => {
  try {
    console.log('started converting for storeCSVFileAsJson');
    const jsonArray = await csv().fromString(csvData);
    fs.writeFileSync(path.join(...outputFilePath, 'client.json'), JSON.stringify(jsonArray, null, 3));
    console.log('ended converting for storeCSVFileAsJson');
  } catch (e) {
    console.log('Error occurred in store file', e);
  }
};

/*Application CSV file [t-req-request] to Application JSON */
const convertApplicationListToJson = async ({ csvData }) => {
  console.log('started converting for convertApplicationListToJson');
  const jsonArray = await csv().fromString(csvData);
  console.log('applicationCsvToJson length::', jsonArray.length);
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
        console.log('filtered data length', applicationId, i + '/', jsonArray.length);
        const filteredObject = {};
        filteredData.forEach((i) => {
          filteredObject[i.no_seq_request] = i;
        });
        const keyValues = Object.keys(filteredObject).map(key => parseInt(key));
        // processDone[jsonArray[i]['id_request']] = filteredObject;
        processDone[jsonArray[i]['id_request']] = {
          [Math.max(...keyValues)]: filteredObject[Math.max(...keyValues)]
        };
      }
    }
  }
  fs.writeFileSync(
      path.join(...outputFilePath,'application-list-filtered.json'),
    JSON.stringify(processDone, null, 3),
  );
  console.log('ended converting for convertApplicationListToJson');
};

/*Note CSV file [t-seq-note] to Note JSON */
const noteCSVToJson = async ({ csvData }) => {
  console.log('started converting for noteCSVToJson');
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, i + '/', jsonArray.length);
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
  fs.writeFileSync(path.join(...outputFilePath,'notes.json'), JSON.stringify(processDone, null, 3));
  console.log('ended converting for noteCSVToJson');
};

/*Common CSVs to JSON */
const csvToJson = async ({ csvData, fileName }) => {
  console.log('started converting for csvToJson');
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, i + '/', jsonArray.length);
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
  fs.writeFileSync(path.join(...outputFilePath, fileName), JSON.stringify(processDone, null, 3));
  console.log('ended converting for csvToJson');
};

/*Note Application Question file [t-seq-note] to Application Question JSON */
const questionCSVToJson = async ({ csvData, fileName }) => {
  console.log('started converting for questionCSVToJson');
  const jsonArray = await csv().fromString(csvData);
  const processDone = {};
  console.log('questionCSVToJson length::', jsonArray.length);
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, i + '/', jsonArray.length);
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
  fs.writeFileSync(path.join(...outputFilePath, fileName), JSON.stringify(processDone, null, 3));
  console.log('ended converting for questionCSVToJson');
};

/*Application CSV file [t-application-details & t-approved-application-details] to Application JSON */
const applicationCsvToJson = async ({ csvData, fileName }) => {
  console.log('started converting for applicationCsvToJson');
  const jsonArray = await csv().fromString(csvData);
  console.log('applicationCsvToJson length::', jsonArray.length);
  const processDone = {};
  for (let i = 0; i < jsonArray.length; i++) {
    if (!processDone[jsonArray[i]['id_request']]) {
      const applicationId = jsonArray[i]['id_request'];
      const filteredData = jsonArray.filter(
        (obj) => obj['id_request'] === applicationId,
      );
      console.log('filtered data length', applicationId, i + '/', jsonArray.length);
      const filteredObject = {};
      filteredData.forEach((i) => {
        filteredObject[i.no_seq_request] = i;
      });
      const keyValues = Object.keys(filteredObject).map(key => parseInt(key));
      // processDone[jsonArray[i]['id_request']] = filteredObject;
      processDone[jsonArray[i]['id_request']] = {
        [Math.max(...keyValues)]: filteredObject[Math.max(...keyValues)]
      };
    }
  }
  fs.writeFileSync(path.join(...outputFilePath, fileName), JSON.stringify(processDone, null, 3));
  console.log('ended converting for applicationCsvToJson');
};

/* Comment out below function call to disable creating JSON of the Client & Client Code*/
// storeCSVFileAsJson({ csvData: activeClientCSV.toString() });

noteCSVToJson({ csvData: noteCSV.toString() });

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

convertApplicationListToJson({ csvData: applicationCSV.toString() });

// TODO add Promise.all
