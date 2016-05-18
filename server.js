"use strict";

const argv = require('minimist')(process.argv.slice(2), {
	"string": ["tagvision.hostname"],
	"default": {
		"port": 7000,
		"tagvision.hostname": "localhost",
		"tagvision.port": 6000
	}

});

const RFIDClient = require("./tagvision-protocol").client;
const WebSocketServer = require("websocket").server;
const http = require("http");
const log4js = require("log4js"); 
const port = argv.port;
const logger = log4js.getLogger("test");
// redirect console
console.log = logger.debug.bind(logger);
console.debug = logger.debug.bind(logger);
console.error = logger.error.bind(logger);

var server = http.createServer(function(request, response) {
	console.debug("Received request for " + request.url);
	response.writeHead(404);
	response.end();
});
server.listen(port, function() {
	console.debug("Server is listening on port " + port);
});

const wsServer = new WebSocketServer({
	httpServer: server,
	autoAcceptConnections: true,
	maxReceivedFrameSize: 64*1024*1024,	 // 64MiB
	maxReceivedMessageSize: 64*1024*1024, // 64MiB
	fragmentOutgoingMessages: false,
	keepalive: false,
	disableNagleAlgorithm: false
});

const rfidClient = new RFIDClient({ hostname: argv.tagvision.hostname, port: argv.tagvision.port });
rfidClient.on("connected", function() {
	console.debug("RFID connected");
	rfidClient.on("sessionStarted", function() {
		console.debug("Session started");
	})
	rfidClient.startSession();
});
rfidClient.connect();

const wrapperServerFn = function(rfidClient) {
	var connectionNumber = 0;
	return function(connection) {
		const num = (++connectionNumber);

		function log() {
			var args = Array.prototype.slice.call(arguments);
			args.unshift("#"+num);
			console.debug.apply(console, args);
		}

		function error() {
			var args = Array.prototype.slice.call(arguments);
			args.unshift("#"+num);
			console.debug.apply(console, args);
		}

		log("Connection accepted - Protocol Version " + connection.webSocketVersion);

		const validCommands = ["reread", "activate", "deactivate"];

		var onReceived = function(evt) {
			log("evt:", evt);
			connection.sendUTF(JSON.stringify(evt));
		};

		function sendCallback(err) {
			if (err) {
				error("send():", err);
				connection.drop();
				setTimeout(function() {
					process.exit(100);
				}, 100);
			}
		}
		connection.on("message", function(message) {
			if (message.type === "utf8") {
				log("Received utf-8 message of " + message.utf8Data.length + " characters.");
				message = ""+message.utf8Data;
				log("message", message);
				message = JSON.parse(message);
				log("message", message);
				if (validCommands.indexOf(message.command) != -1) {
					rfidClient.reread();
				}
			}
		});
		connection.on("close", function(reasonCode, description) {
			log(" Peer " + connection.remoteAddress + " disconnected.");
			connection._debug.printOutput();
			rfidClient.removeListener("received", onReceived);
		});

		rfidClient.on("received", onReceived);
	}
}
wsServer.on("connect", wrapperServerFn(rfidClient));
