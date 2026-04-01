@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\finrate
echo n | npx create-next-app@latest app --typescript --tailwind --eslint --app --src-dir --import-alias @/* --no-git --use-npm
echo DONE > C:\finrate\done.txt
