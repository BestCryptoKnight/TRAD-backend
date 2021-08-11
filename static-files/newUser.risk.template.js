/**
 * Config
 * */
const config = require('../config');
module.exports = ({ name, setPasswordLink }) => {
  return `<html>
<head>
    <meta charSet='utf-8'/>
    <meta name='viewport' content='width=device-width, initial-scale=1'/>
    <style>
        @font-face {
        font - family: "GoogleSans-Medium";
        src: local("GoogleSans-Medium"), url("${config.server.backendServerUrl}fonts/GoogleSans-Medium.ttf") format("truetype");
        font-weight: normal;
    }

        @font-face {
        font - family: "GoogleSans-Regular";
        src: local("GoogleSans-Regular"), url("${config.server.backendServerUrl}fonts/GoogleSans-Regular.ttf") format("truetype");
        font-weight: normal;
    }

        @font-face {
        font - family: "GoogleSans-Bold";
        src: local("GoogleSans-Bold"), url("${config.server.backendServerUrl}fonts/GoogleSans-Bold.ttf") format("truetype");
        font-weight: normal;
    }

        body * {
        font - family: GoogleSans-Regular, SansSerif;
    }
    </style>
</head>
<body style="margin:0; padding:0; word-spacing:normal; background-color: #F4F6F8">
<div role="article" aria-roledescription="email" lang="en"
     style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#F4F6F8;">
    <table width="100%" border="0" cellSpacing="0" cellPadding="0" bgcolor="#ffffff" role="presentation"
           style="width:100%;border:none;border-spacing:0;border-collapse:collapse">
        <tbody>
        <tr>
            <td align="center" style="padding: 5%; background-color: #F4F6F8;">
                <table cellSpacing='0' cellPadding='0' role="presentation"
                       style="width: 600px; background-color: white; border-radius: 10px; box-shadow: 0px 0px 30px #BFBFBF29;">
                    <tr>
                        <td height="32"
                            style="background-color: #003A78; border-top-left-radius: 10px; border-top-right-radius: 10px">
                        </td>
                    </tr>

                    <tr>
                        <td align="center" valign="center" height="85" style="background-color: #F4F6F8;">
                            <img height="40"
                                 src="${config.server.backendServerUrl}mail-images/tcr-logo.png"/>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" valign="center" width="100"
                            style="padding-top: 20px; font-size: 24px; font-family: GoogleSans-Medium; color: #003A78; background-color: white;">
                            Dear ${name}!
                        </td>
                    </tr>

                    <tr>
                        <td align="center" valign="center" width="100"
                            style="font-size: 34px; font-family: GoogleSans-Bold; color: #EF7B10; background-color: white;">
                            Welcome to TCR
                        </td>
                    </tr>


                    <tr>
                        <td align="center" valign="center" width="100"
                            style="padding: 3px 15%; font-size: 15px; font-family: GoogleSans-Medium; color: #37404D; background-color: white; opacity: .5">
                            We’re glad you’re here.
                        </td>
                    </tr>

                    <tr>
                        <td align="center" valign="center" width="80"
                            style="padding: 20px 5% 5px 5%; font-size: 22px; font-family: GoogleSans-Medium; color: #003A78; background-color: white">
                            Check out our client portal and get daily updates on all your credit limits, claims
                            and alerts.
                        </td>
                    </tr>

                    <!--<tr>
                        <td align="center" valign="center" width="60"
                            style="padding: 5px 15%; font-size: 15px; line-height: 24px; font-family: GoogleSans-Regular; color: #828F9D; background-color: white">
                            Check out our client portal and get daily updates on all your credit limits, claims
                            and alerts.
                        </td>
                    </tr>-->

                    <tr>
                        <td align="center" valign="center"
                            style="padding: 10px 0 20px 0; background-color: white">
                            <a href="${setPasswordLink}" style="text-decoration: none;">
                                <button
                                    style="padding: 10px 20px; font-size: 16px; font-family: GoogleSans-Medium; color: white; background-color: #38c976; border-radius: 5px; border: none; outline: none; cursor: pointer">
                                    Get Started!
                                </button>
                            </a>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <table width="100%" style="border-collapse: collapse">
                                <tr>
                                    <td width="33.33" align="center" valign="middle"
                                        style="vertical-align: middle; word-break: break-word; border-left: 0; padding: 20px; background-color: #F4F6F8;">
                                        <table>
                                            <tr>
                                                <td align="center">
                                                    <img height="30"
                                                         src="${config.server.backendServerUrl}mail-images/call.png"/>
                                                </td>
                                            </tr>
                                            <tr style="font-size: 13px; color: #003A78">
                                                <td align="center">
                                                    <a style=" font-family: GoogleSans-Medium; color: #003A78; text-decoration: none"
                                                       href="tel:1234420581">
                                                        1234 420 581
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td width="33.33" align="center" valign="middle"
                                        style="word-break: break-word; border-left: 2px solid white; border-right: 2px solid white; padding: 20px; background-color: #F4F6F8;">
                                        <table>
                                            <tr>
                                                <td align="center">
                                                    <img height="30"
                                                         src="${config.server.backendServerUrl}mail-images/mail.png"/>
                                                </td>
                                            </tr>
                                            <tr style="font-size: 13px; color: #003A78">
                                                <td align="center">
                                                    <a style=" font-family: GoogleSans-Medium; color: #003A78; text-decoration: none"
                                                       href="mailto:info@tradecreditrisk.com.au">
                                                        info@tradecreditrisk.com.au
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td width="33.33" align="center" valign="middle"
                                        style="word-break: break-word; border-right: 0; padding: 20px; background-color: #F4F6F8;">
                                        <table>
                                            <tr>
                                                <td align="center">
                                                    <img height="30"
                                                         src="${config.server.backendServerUrl}mail-images/location.png"/>
                                                </td>
                                            </tr>
                                            <tr style="font-size: 13px; color: #003A78">
                                                <td align="center">
                                                    Suite 11, 857 Doncaster Road Doncaster East, Victoria 3109
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 30px 0 5px 0">
                            <img height="40"
                                 src="${config.server.backendServerUrl}mail-images/trad-icon.png"/>
                        </td>
                    </tr>

                    <tr>
                        <td align='center' valign='center'
                            style='padding: 5px 40px; font-size: 16px; font-family: GoogleSans-Medium; line-height: 24px; font-weight: 400;  color: #828F9D'>
                            Copyright © 2021 Trade Credit Risk
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding-bottom: 40px">
                            <table>
                                <tr>
                                    <td>
                                        <a style="text-decoration: none">
                                            <img height="30" style="cursor:pointer;"
                                                 src="${config.server.backendServerUrl}mail-images/facebook.png"/>
                                        </a>
                                    </td>
                                    <td>
                                        <a style="text-decoration: none">
                                            <img height="30" style="cursor:pointer;"
                                                 src="${config.server.backendServerUrl}mail-images/linkedin.png"/>
                                        </a>
                                    </td>
                                    <td>
                                        <a style="text-decoration: none">
                                            <img height="30" style="cursor:pointer;"
                                                 src="${config.server.backendServerUrl}mail-images/twitter.png"/>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
        </tbody>
    </table>
</div>
</body>
</html>`;
};
