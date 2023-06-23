const ExcelJS = require('exceljs');

const { numberWithCommas } = require('./report.helper');
const config = require('./../config');
const { getBase64 } = require('./pdf-generator.helper');
const Logger = require('./../services/logger');
const StaticData = require('./../static-files/staticData.json');

const generateExcel = ({ data, reportFor, headers, filter, title }) => {
  return new Promise(async (resolve, reject) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportFor);

    const base64Data = await getBase64(
      `${config.staticServing.bucketURL}static-files/mail-images/psc-trad.png`,
    );
    const image = workbook.addImage({
      base64: base64Data,
      extension: 'png',
    });
    worksheet.addImage(image, {
      ext: { width: headers.length <= 2 ? 269 : 300, height: 40 },
    });

    const currentDate = new Date();
    filter.unshift({
      label: 'Report Printing Date',
      value: `${
        currentDate.getDate() +
        '/' +
        (currentDate.getMonth() + 1) +
        '/' +
        currentDate.getFullYear()
      }`,
      type: 'string',
    });

    const row = worksheet.addRow([
      title ? `${title}: ${reportFor}` : `${reportFor}`,
    ]);
    row.height = 30;
    let date;
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        if (filter[i].type === 'date') {
          date = new Date(filter[i]['value']);
          filter[i]['value'] =
            date.getDate() +
            '/' +
            (date.getMonth() + 1) +
            '/' +
            date.getFullYear();
        }
        const row = worksheet.addRow([
          `${filter[i].label}: ${filter[i].value}`,
        ]);
        worksheet.getCell(`A${i + 2}`).alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
        worksheet.getCell(`A${i + 2}`).font = {
          bold: true,
          size: 12,
        };
        row.height =
          filter[i].value.length / 15 < 15 ? 15 : filter[i].value.length / 15;
        row.height = row.height + 5;
      }
    }
    worksheet.getCell('A1').alignment = {
      vertical: 'middle',
      horizontal: 'center',
    };
    worksheet.getCell('A1').font = {
      bold: true,
      size: 16,
    };
    switch (reportFor) {
      case 'Limit List':
        addColumnsForLimitList({ data, worksheet, headers, filter });
        break;
      case 'Debtor List':
        addColumnsForDebtorList({ data, worksheet, headers, filter });
        break;
      case 'Alert Report':
        addColumnsForAlertList({ data, worksheet, headers, filter });
        break;
      case 'Pending Application':
        addColumnsForPendingApplicationList({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Application List':
        addColumnsForApplicationList({ data, worksheet, headers, filter });
        break;
      case 'Usage Report':
        addColumnsForUsageReport({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Review Report':
        addColumnsForReviewReport({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Usage per Client Report':
        addColumnsForUsagePerClientReport({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Limit History Report':
        addColumnsForLimitHistoryReport({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Credit Limit List':
        addColumnsForCreditLimitList({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Task List':
        addColumnsForTaskList({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
      case 'Overdue Report':
        addColumnsForOverdueList({
          data,
          worksheet,
          headers,
          filter,
        });
        break;
    }
    workbook.xlsx.writeBuffer().then((buffer) => {
      return resolve(buffer);
    });
  });
};

const addColumnsForApplicationList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:S1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:S${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 40;
    worksheet.getColumn(4).width = 40;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 25;
    worksheet.getColumn(7).width = 25;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;
    worksheet.getColumn(11).width = 25;
    worksheet.getColumn(12).width = 25;
    worksheet.getColumn(13).width = 20;
    worksheet.getColumn(14).width = 30;
    worksheet.getColumn(15).width = 35;
    worksheet.getColumn(16).width = 30;
    worksheet.getColumn(17).width = 30;
    worksheet.getColumn(18).width = 20;
    worksheet.getColumn(19).width = 20;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:S${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error(
      'Error occurred in addColumnsForApplicationList',
      e.message || e,
    );
  }
};

const addColumnsForDebtorList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:O1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:O${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 20;
    worksheet.getColumn(2).width = 40;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 40;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;
    worksheet.getColumn(11).width = 20;
    worksheet.getColumn(12).width = 20;
    worksheet.getColumn(13).width = 20;
    worksheet.getColumn(14).width = 25;
    worksheet.getColumn(15).width = 25;
    worksheet.getColumn(16).width = 20;
    worksheet.getColumn(17).width = 20;
    worksheet.getColumn(18).width = 25;
    worksheet.getColumn(19).width = 20;
    worksheet.getColumn(20).width = 25;
    worksheet.getColumn(21).width = 20;
    worksheet.getColumn(22).width = 25;
    worksheet.getColumn(23).width = 25;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add debtor list data', e.message || e);
  }
};

const addColumnsForLimitList = async ({ data, worksheet, headers, filter }) => {
  try {
    worksheet.mergeCells('A1:O1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:O${i + 2}`);
      }
    }

    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );

    const staticDisclaimer = [];
    staticDisclaimer[1] = StaticData.disclaimer;
    const row = worksheet.addRow(staticDisclaimer);
    row.font = {
      name: 'Calibri',
      size: 10,
      wrapText: true,
    };
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );

    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 40;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 25;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 30;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;
    worksheet.getColumn(11).width = 20;
    worksheet.getColumn(12).width = 20;
    worksheet.getColumn(13).width = 20;
    worksheet.getColumn(14).width = 30;
    worksheet.getColumn(15).width = 35;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const addColumnsForAlertList = async ({ data, worksheet, headers, filter }) => {
  try {
    worksheet.mergeCells('A1:I1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:I${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 40;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 40;
    worksheet.getColumn(6).width = 20;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 45;
    worksheet.getColumn(10).width = 15;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:I${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add alert report data', e.message || e);
  }
};

const addColumnsForPendingApplicationList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:I1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:I${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 26;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 26;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 20;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:I${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const addColumnsForUsageReport = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:I1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:I${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 30;
    worksheet.getColumn(8).width = 30;
    worksheet.getColumn(9).width = 30;
    worksheet.getColumn(10).width = 30;
    worksheet.getColumn(11).width = 30;
    worksheet.getColumn(12).width = 30;
    worksheet.getColumn(13).width = 30;
    worksheet.getColumn(14).width = 30;
    worksheet.getColumn(15).width = 30;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:I${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const addColumnsForReviewReport = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:R1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:R${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 25;
    worksheet.getColumn(5).width = 40;
    worksheet.getColumn(6).width = 25;
    worksheet.getColumn(7).width = 25;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;
    worksheet.getColumn(11).width = 25;
    worksheet.getColumn(12).width = 25;
    worksheet.getColumn(13).width = 25;
    worksheet.getColumn(14).width = 25;
    worksheet.getColumn(15).width = 25;
    worksheet.getColumn(16).width = 25;
    worksheet.getColumn(17).width = 25;
    worksheet.getColumn(18).width = 25;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:R${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const addColumnsForUsagePerClientReport = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:T1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:T${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 25;
    worksheet.getColumn(9).width = 25;
    worksheet.getColumn(10).width = 25;
    worksheet.getColumn(11).width = 25;
    worksheet.getColumn(12).width = 25;
    worksheet.getColumn(13).width = 25;
    worksheet.getColumn(14).width = 25;
    worksheet.getColumn(15).width = 25;
    worksheet.getColumn(16).width = 25;
    worksheet.getColumn(17).width = 25;
    worksheet.getColumn(18).width = 25;
    worksheet.getColumn(19).width = 25;
    worksheet.getColumn(20).width = 45;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:T${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error(
      'Error occurred in add usage per client report data',
      e.message || e,
    );
  }
};

const addColumnsForLimitHistoryReport = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:Q1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:Q${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 30;
    worksheet.getColumn(7).width = 20;
    worksheet.getColumn(8).width = 25;
    worksheet.getColumn(9).width = 25;
    worksheet.getColumn(10).width = 25;
    worksheet.getColumn(11).width = 25;
    worksheet.getColumn(12).width = 25;
    worksheet.getColumn(13).width = 25;
    worksheet.getColumn(14).width = 25;
    worksheet.getColumn(15).width = 25;
    worksheet.getColumn(16).width = 25;
    worksheet.getColumn(17).width = 35;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:Q${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error(
      'Error occurred in add usage per client report data',
      e.message || e,
    );
  }
};

const addColumnsForCreditLimitList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:M1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:M${i + 2}`);
      }
    }

    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );

    const staticDisclaimer = [];
    staticDisclaimer[1] = StaticData.disclaimer;
    const row = worksheet.addRow(staticDisclaimer);
    row.font = {
      name: 'Calibri',
      size: 10,
      wrapText: true,
    };
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );

    worksheet.getColumn(1).width = 45;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 25;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 25;
    worksheet.getColumn(7).width = 25;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 25;
    worksheet.getColumn(10).width = 25;
    worksheet.getColumn(11).width = 20;
    worksheet.getColumn(12).width = 70;
    worksheet.getColumn(13).width = 40;

    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:M${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const addColumnsForTaskList = async ({ data, worksheet, headers, filter }) => {
  try {
    worksheet.mergeCells('A1:J1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:J${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 25;
    worksheet.getColumn(2).width = 45;
    worksheet.getColumn(3).width = 35;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 25;
    worksheet.getColumn(6).width = 25;
    worksheet.getColumn(7).width = 25;
    worksheet.getColumn(8).width = 20;
    worksheet.getColumn(9).width = 20;
    worksheet.getColumn(10).width = 20;

    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:J${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add task list data', e.message || e);
  }
};

const addColumnsForOverdueList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    const lastColumn = convertNumberToAlphabet(headers.length);
    worksheet.mergeCells(`A1:${lastColumn}1`);
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:${lastColumn}${i + 2}`);
      }
    }
    for (let i = 1; i <= headers.length; i++) {
      worksheet.getColumn(i).width = i === 1 ? 45 : 30;
    }

    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:${lastColumn}${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    Logger.log.error('Error occurred in add overdue data', e.message || e);
  }
};

const addDataForTable = ({ data, worksheet, headers }) => {
  try {
    const headerArray = headers.map((i) => i.label);
    const row = worksheet.addRow(headerArray);
    row.height = 21;
    worksheet.getRow(worksheet.lastRow.number).eachCell((cell) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.font = {
        bold: true,
        size: 12,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF666666' },
      };
    });
    const lastRow = worksheet.lastRow;
    let newRowNumber = lastRow.number + 1;
    let getRowInsert;
    const cellBorder = {
      top: { style: 'thin', color: { argb: 'FF666666' } },
      left: { style: 'thin', color: { argb: 'FF666666' } },
      bottom: { style: 'thin', color: { argb: 'FF666666' } },
      right: { style: 'thin', color: { argb: 'FF666666' } },
    };
    let date;
    let value;
    for (let i = 0; i < data.length; i++) {
      getRowInsert = worksheet.getRow(newRowNumber);
      for (let j = 0; j <= headers.length; j++) {
        if (headers[j]) {
          if (headers[j]['type'] === 'date' && data[i][headers[j]['name']]) {
            date = new Date(data[i][headers[j]['name']]);
            data[i][headers[j]['name']] =
              date.getDate() +
              '/' +
              (date.getMonth() + 1) +
              '/' +
              date.getFullYear();
          }
          value = data[i][headers[j]['name']];
          if (data[i][headers[j]['name']] === 0) {
            value = true;
          }
          if (headers[j]['type'] === 'amount' && value) {
            data[i][headers[j]['name']] =
              '$' + numberWithCommas(data[i][headers[j]['name']]);
          }
          getRowInsert.getCell(j + 1).value =
            data[i][headers[j]['name']] || '-';
          if (data[i][headers[j]['name']]) {
            getRowInsert.getCell(j + 1).alignment = {
              vertical: 'middle',
              horizontal: 'left',
              wrapText: true,
            };
          }
        }
      }
      newRowNumber++;
      getRowInsert.eachCell((cell) => {
        cell.border = cellBorder;
      });
    }
    /*data.forEach((limit) => {
      getRowInsert = worksheet.getRow(newRowNumber);
      getRowInsert.getCell(1).value = limit.clientId || '-';
      getRowInsert.getCell(2).value = limit.insurerId || '-';
      getRowInsert.getCell(3).value = limit.debtorId || '-';
      getRowInsert.getCell(4).value = limit.abn || '-';
      getRowInsert.getCell(5).value = limit.acn || '-';
      getRowInsert.getCell(6).value = limit.registrationNumber || '-';
      getRowInsert.getCell(7).value = limit.country || '-';
      getRowInsert.getCell(8).value = limit.applicationId || '-';
      getRowInsert.getCell(9).value = limit.creditLimit || '-';
      getRowInsert.getCell(10).value = limit.acceptedAmount || '-';
      getRowInsert.getCell(11).value = limit.approvalDate || '-';
      getRowInsert.getCell(12).value = limit.expiryDate || '-';
      getRowInsert.getCell(13).value = limit.limitType || '-';
      getRowInsert.getCell(14).value = limit.clientReference || '-';
      getRowInsert.getCell(15).value = limit.comments || '-';
      newRowNumber++;
      getRowInsert.eachCell((cell) => {
        cell.border = cellBorder;
      });
    });*/
  } catch (e) {
    Logger.log.error('Error occurred in add limit list data', e.message || e);
  }
};

const convertNumberToAlphabet = (number) => {
  try {
    return (number + 9).toString(36).toUpperCase();
  } catch (e) {
    Logger.log.error(
      'Error occurred in convert number to alphabet',
      e.message || e,
    );
  }
};

module.exports = {
  generateExcel,
};
