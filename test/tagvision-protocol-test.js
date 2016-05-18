'use strict';

const readline = require('readline');
const RFIDClient = require('../tagvision-protocol').client;

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

var rfidClient = new RFIDClient({host: "127.0.0.1", port: "6000", collectEventDelay: 250});

rfidClient.on('received', function(evt) {
	console.log("evt:", evt);
});
var readCommand = function(command) {
	if (command == '') {
		command = 'reread';
	}
	rfidClient[command]();
	rl.question("Enter command:\n", readCommand);
};
rfidClient.on('connected', function() {
	rfidClient.on('sessionStarted', function() {
		rl.question("Enter command:\n", readCommand);
	})
	rfidClient.startSession();
});
rfidClient.connect();
