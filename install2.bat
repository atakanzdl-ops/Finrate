@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\finrate\app
npm install prisma @prisma/client bcryptjs @types/bcryptjs jsonwebtoken @types/jsonwebtoken
echo DONE_%ERRORLEVEL%
