@echo off
start "" "C:\Bibliotheca-RFID\RFIDIFServer\RFIDIFServer.exe"
start "" "C:\Bibliotheca-RFID\RFIDIF\RFIDIF.exe"
timeout 2 > NUL
node server
