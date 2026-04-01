@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\finrate\app
npm install prisma @prisma/client bcryptjs @types/bcryptjs jsonwebtoken @types/jsonwebtoken > C:\finrate\prisma-log.txt 2>&1
echo EXIT:%ERRORLEVEL% >> C:\finrate\prisma-log.txt
