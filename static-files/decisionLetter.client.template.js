/**
 * Config
 * */
const config = require('../config');

module.exports = ({ debtorName, email, contactNumber, address, website }) => {
  return `<html>
<head>
    <meta charset='utf-8'/>
    <meta name='viewport' content='width=device-width, initial-scale=1'/>
</head>
<body style="margin:0; padding:0; word-spacing:normal; font-family: 'open sans', 'helvetica neue', sans-serif; font-size: 15px">
<table>
    <tr>
    <td>
    Dear Team,<br/><br/>Please find attached the REScheck decision on ${debtorName}.<br/><br/>Please kindly confirm the company details noted on the attached Rescheck matches with the correct legal entity that will be placing a purchase order with you.<br/><br/>Please contact us if you have any questions.<br/><br/><br/>Kind Regards,
    </td>
    </tr>
    

    <tr>
    <td style="padding-top: 20px; color: #4B4BA5; font-weight: bold;">
    RISK TEAM
</td>
    </tr>
    <tr>
    <td style="color: #636d7b; font-size: 15px">
<br/> Trade Credit Risk Pty Ltd.<br/><br/>
${address}<br/><br/>
Ph. ${contactNumber} Fax. 03 9841 7660<br/><br/>
Em:<a style="color: #003A78; text-decoration: none"
                                                   href="mailto:${email}">
                                                    ${email}
                                                </a> <a style="color: #003A78; text-decoration: none"
                                                   href="${website}">
                                                    www.tradecreditrisk.com.au
                                                </a> AFSL: <a style="color: #003A78; text-decoration-line: underline;">
                                                    422672
                                                </a><br/><br/>
</td>
    </tr>
       <tr>
                    <td >
                        <img height="40" src="${config.staticServing.bucketURL}static-files/mail-images/trad-logo.png"/>
                    </td>
                </tr>
                <tr style='padding: 30px 0 0 0; font-size: 12px; line-height: 24px; font-weight: 400;'>
                <td> 
                <br/>The information in this email is confidential and may be legally privileged. It is intended solely for the addressee(s). Access to this email by anyone else is unauthorized. If you are not intended recipient, any disclosure, copying, distribution or any action taken or omitted to be taken in reliance on it, is prohibited and may be unlawful.</td>
                </tr>
</table>
</body>
</html>`;
};
