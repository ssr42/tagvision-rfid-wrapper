"use strict";

const net = require("net");
const util = require("util");
const EventEmitter = require("events");
const StateMachine = require("./lib/state-machine.js");

var Client = function (config) {
	EventEmitter.call(this);

	config = config || {}
	const port = config.port || 6000;
	const hostname = config.hostname || "127.0.0.1";
	const debugEnabled = config.debugEnabled || true;
	const collectEventEnable = config.collectEventEnable || true;
	const collectEventDelay = config.collectEventDelay || 500;

	var socket = null;

	var debug = function debug(msg, arg) {
		if (debugEnabled) {
			if (arg) {
				console.log(msg, arg);
			} else {
				console.log(msg);
			}
		}
	}.bind(this);

	var receive = function receive(data) {
		var msg = ""+data;
		msg = msg.substring(0, msg.length-1);	// remove \r
		debug("Received: msg="+msg+"; state="+fsm.current);
		var arg = null;
		if (msg.indexOf("RDT") == 0) {
			arg = msg.substring(3);
			msg = "RDT";
		}
		if (fsm[msg]) {
			fsm[msg](arg);
		} else {
			console.error("event "+msg+" not found.");
		}
	}

	var send = function send(data) {
		if (socket) {
			debug("Sending:", data);
			socket.write(data+"\r", function() {
				debug("data send:", data)
			});
		}
	}.bind(this);

	var emit = function emit(name, event) {
		this.emit(name, event);
	}.bind(this);

	var parseBarcode = function parseBarcode(msg) {
		var p = msg.indexOf("|");
		var barcode = msg.substring(0, p);
		var missingVolume = msg.substring(p+1);
		return { barcode: barcode, missingVolume: missingVolume == "1" };
	}

	var collectFunction = function collectFunction(type, answer, barcodeList) {
		var collectEventList = [];
		var collectEventTimer = null;
		return function(name, from, to, msg) {
				var barcodeMsg = parseBarcode(msg);
				var barcodeInList = barcodeList.length == 0 || barcodeList.indexOf(barcodeMsg.barcode) != -1;
				if (barcodeInList) {
					collectEventList.push(parseBarcode(msg));
				}
				if (collectEventEnable) {
					if (collectEventTimer) {
						clearTimeout(collectEventTimer);
					}
					collectEventTimer = setTimeout(function() {
						barcodeList.length = 0;
						emit("received", { event: type, barcodeStatusList: collectEventList }); 
						collectEventList = [];
						fsm.endRequest();
					}, collectEventDelay);	// wait for more events 
					if (barcodeInList) {
						send(answer);
					} else {
						send("OK");
					}
					fsm.moreRequest();
				} else {
					send(answer);
					barcodeList.length = 0;
					emit("received", { event: type, barcodeStatusList: collectEventList }); 
					collectEventList = [];
					fsm.endRequest();
				}
			}
	}
	
	var barcodeList = [];	// shared list
	var fsm = StateMachine.create({
		initial: "Disconnected",
		events: [
			{ name: "connect",			from: "Disconnected",				to: "Connecting" },
			{ name: "connected",		from: "Connecting", 				to: "ConnectedNotVerified" },
			{ name: "OK",				from: "ConnectedNotVerified", 		to: "Connected" },
			{ name: "startSession",		from: "Connected"	,				to: "StartingSession" },
			{ name: "OKW",				from: "StartingSession",			to: "InSession" },
			{ name: "RDT",				from: "InSession",					to: "InRequest" },
			{ name: "moreRequest",		from: "InRequest",					to: "InMoreRequest" },
			{ name: "endRequest",		from: "InRequest",					to: "InSession" },
			{ name: "RDT",				from: "InMoreRequest",				to: "InRequest" },
			{ name: "endRequest",		from: "InMoreRequest",				to: "InSession" },
			{ name: "reread",			from: "InSession",					to: "ReReadingDisconnecting" },
			{ name: "OK",				from: "ReReadingDisconnecting",		to: "ReReadingConnecting" },
			{ name: "OKW",				from: "ReReadingConnecting",		to: "InSession" },
			{ name: "activate",			from: "InSession",					to: "ActivatingDisconnecting" },
			{ name: "OK",				from: "ActivatingDisconnecting",	to: "ActivatingConnecting" },
			{ name: "OKW",				from: "ActivatingConnecting",		to: "Activating" },
			{ name: "RDT",				from: "Activating",					to: "ActivatingInRequest" },
			{ name: "moreRequest",		from: "ActivatingInRequest",		to: "ActivatingInMoreRequest" },
			{ name: "endRequest",		from: "ActivatingInRequest",		to: "InSession" },
			{ name: "RDT",				from: "ActivatingInMoreRequest",	to: "ActivatingInRequest" },
			{ name: "endRequest",		from: "ActivatingInMoreRequest",	to: "InSession" },
			{ name: "deactivate",		from: "InSession",					to: "DeactivatingDisconnecting" },
			{ name: "OK",				from: "DeactivatingDisconnecting",	to: "DeactivatingConnecting" },
			{ name: "OKW",				from: "DeactivatingConnecting",		to: "Deactivating" },
			{ name: "RDT",				from: "Deactivating",				to: "DeactivatingInRequest" },
			{ name: "moreRequest",		from: "DeactivatingInRequest",		to: "DeactivatingInMoreRequest" },
			{ name: "endRequest",		from: "DeactivatingInRequest",		to: "InSession" },
			{ name: "RDT",				from: "DeactivatingInMoreRequest",	to: "DeactivatingInRequest" },
			{ name: "endRequest",		from: "DeactivatingInMoreRequest",	to: "InSession" }
		],
		callbacks: {
			onConnecting: function() { 
				socket = new net.Socket();
				socket.on("data", receive);
				socket.connect(port, hostname, function() {
					fsm.connected();
				});
			},
			onConnectedNotVerified: function() {
				send("VER2.00");
			},
			onConnected: function() {
				emit("connected");
			},
			onStartingSession: function() {
				send("BEGW");
			},
			onOKW: function() {
				emit("sessionStarted");
			},
			onInRequest: collectFunction("received", "OK", barcodeList),
			onReReadingDisconnecting: function(event, from, to, list) {
				Array.prototype.push.apply(barcodeList, list);
				send("END");
			},
			onReReadingConnecting: function() {
				send("BEGW");
			},
			onActivatingDisconnecting: function(event, from, to, list) {
				Array.prototype.push.apply(barcodeList, list);
				send("END");
			},
			onActivatingConnecting: function() {
				send("BEGW");
			},
			onActivatingInRequest: collectFunction("activated", "OK1", barcodeList),
			onDeactivatingDisconnecting: function(event, from, to, list) {
				Array.prototype.push.apply(barcodeList, list);
				send("END");
			},
			onDeactivatingConnecting: function() {
				send("BEGW");
			},
			onDeactivatingInRequest: collectFunction("deactivated", "OK0", barcodeList),
			onenterstate: function(event, from, to) { 
				debug("onenterstate: event="+event+"; from="+from+"; to="+to) 
			}
		}
	});
	
	fsm.error = function(name, from, to, args, error, msg, e) {
		console.log("name="+name+"; from="+from+"; to="+to+"; args=", args, "error="+error+"; msg="+msg+"; e=",e);
	}

	this.connect = function connect() {
		fsm.connect();
	}

	this.startSession = function startSession() {
		fsm.startSession();
	};

	this.reread = function reread() {
		if (fsm.can("reread")) {
			fsm.reread([]);
		}
	}

	this.activate = function activate() {
		if (fsm.can("activate")) {
			fsm.activate([]);
		}
	}

	this.deactivate = function activate() {
		if (fsm.can("deactivate")) {
			fsm.deactivate([]);
		}
	}
}


util.inherits(Client, EventEmitter);

exports.client = Client;
