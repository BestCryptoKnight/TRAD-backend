# TRAD Backend Server

### Backend server for Credit Risk Assessment

##Introduction:
The TRAD is a financial services company who provides credit assessments for large businesses to protect financial health of the business.

- Purpose of this project:

  - Decrease the financial risk for large businesses with the system that allow to send information to the customers about their clients.
  - Automations on the credit limit.

- What we have archived with this project:
  - A dynamic system with integration of different services like ABR Lookup, New Zealand Lookup, RSS, Illion.

##Module:

- Backend Server
- Risk Panel
- Client Panel

### 1 Backend Server

### 1.1 Purpose of the module:

- This is the main core of the project. It connects Database, third party API services, Mailer service, etc.
- All the API calls from other two modules are pointed here.

### 1.2 Features of the module:

- All modules are managed here like Dashboard, Users, Insurer, Clients, Debtors, Applications, Tasks, Overdues, Claims, Reports.
- Access management is there for different modules and users.
- Logging of all the activities is here.

###3. Technical stack of module:

- Back-end Framework: NodeJS

###4. Configure Module:

- Configure back-end point
  - In **source/admin-panel/. env-cmdrc** (environment file) replace the ‘REACT_APP_BASE_URL’ with the generated Api URL pointing to your backend according to environments.

###5. Get up and running:

- Install Requirements
- Go to source/admin-panel directory and open terminal for that directory
  - Run **“npm I”** to install dependencies.
  - Run **“npm run <environment name>”** to run project and admin-panel loads on port available with your system default is port: 3000, **ex: npm run dev**.
  - Login into panel from browser at **“localhost:<port number>”** by providing credentials.
  - Dashboard will load once authentication done.
