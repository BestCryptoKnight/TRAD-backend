const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
let filePath = path.join(__dirname, '');
let fileName = `new_users1${Date.now()}.xlsx`;

const { numberWithCommas } = require('./report.helper');

console.log('Current working directory:', __dirname);

const generateExcel = ({ data, reportFor, headers, filter }) => {
  return new Promise((resolve, reject) => {
    console.log(data.length);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportFor);
    const row = worksheet.addRow([`Report for: ${reportFor}`]);
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
        worksheet.addRow([`${filter[i].label}: ${filter[i].value}`]);
        worksheet.getCell(`A${i + 2}`).alignment = {
          vertical: 'middle',
          horizontal: 'center',
        };
        worksheet.getCell(`A${i + 2}`).font = {
          bold: true,
          size: 12,
        };
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
      case 'Pending Application':
        addColumnsForPendingApplicationList({
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
    // workbook.xlsx.writeFile(fileName);
  });
};

const addColumnsForLimitList = async ({ data, worksheet, headers, filter }) => {
  try {
    worksheet.mergeCells('A1:O1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:O${i + 2}`);
      }
    }
    worksheet.getColumn(1).width = 40;
    worksheet.getColumn(2).width = 30;
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
    worksheet.getColumn(15).width = 20;
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:O${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    console.log('Error occurred in add limit list data', e);
  }
};

const addColumnsForPendingApplicationList = async ({
  data,
  worksheet,
  headers,
  filter,
}) => {
  try {
    worksheet.mergeCells('A1:H1');
    for (let i = 0; i <= filter.length; i++) {
      if (filter[i]) {
        worksheet.mergeCells(`A${i + 2}:H${i + 2}`);
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
    worksheet.addRow();
    worksheet.mergeCells(
      `A${worksheet.lastRow.number}:H${worksheet.lastRow.number}`,
    );
    await addDataForTable({ data, headers, worksheet });
  } catch (e) {
    console.log('Error occurred in add limit list data', e);
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
          if (headers[j]['type'] === 'amount' && data[i][headers[j]['name']]) {
            data[i][headers[j]['name']] =
              '$' + numberWithCommas(data[i][headers[j]['name']]);
          }
          getRowInsert.getCell(j + 1).value =
            data[i][headers[j]['name']] || '-';
          if (!data[i][headers[j]['name']]) {
            getRowInsert.getCell(j + 1).alignment = {
              vertical: 'middle',
              horizontal: 'center',
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
    console.log('Error occurred in add limit list data', e);
  }
};

module.exports = {
  generateExcel,
};
