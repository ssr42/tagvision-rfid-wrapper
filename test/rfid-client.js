var com = com || {};
com.axiell = com.axiell || {};

com.axiell.rfid = function() {

	function Client(config) {
		this.config = config || { hostname: "localhost", port: 7000 };
		this._subject = new Rx.Subject();
		this._readSubject = new Rx.Subject();
		var readObservable = this._readSubject
			.map(function(evt) {
				return JSON.parse(evt.data);
			})
			.filter(function(e) {
				return e.event == "received";
			})
			.flatMap(function(e) {
				return e.barcodeStatusList;
			})
			.map(function(e) {
				return { event: "received", barcode: e.barcode };
			});
	
		this._observable = Rx.Observable.merge(readObservable, this._subject);
	}

	Client.prototype._send = function(data) {
		this._sendQueue = this._sendQueue || [];
		if (data) {
			if (typeof data !== "string") {
				data = JSON.stringify(data);
			}
			this._sendQueue.push(data);
		}
		if (this._socket) {
			var queue = this._sendQueue;
			this._sendQueue = [];
			queue.forEach(function(data) {
				if (this._socket) {
					console.log("sending ", data);
					this._socket.onNext(data);
				}
			}.bind(this));
		}
	}

	Client.prototype.connect = function() {
		if (!this._socket) {
			var socket = null;
			var openObserver = Rx.Observer.create(function(e) {
				console.log('socket open');
				this._subject.onNext({ event: "connected" });
				this._socket = socket;
				this._send();
			}.bind(this));

			var closingObserver = Rx.Observer.create(function() {
				console.log('socket is about to close');
				if (!this._socket) {
					this._subject.onNext({ event: "connectionFailed", config: this.config });
				} else {
					this._subject.onNext({ event: "disconnected" });
				}
				this._readSubscription.dispose();
				this._socket = null;
			}.bind(this));
		
			this._opening = true;
			socket = Rx.DOM.fromWebSocket("ws://"+this.config.hostname+":"+this.config.port, null, openObserver, closingObserver);
			this._readSubscription = socket.subscribe(
				function(e) {
					console.debug('message: %s', e.data);
					this._readSubject.onNext(e);
				}.bind(this)
			);
		}
	};

	Client.prototype.disconnect = function() {
		if (this._socket) {
			this._readSubscription.dispose();
		}
	}

	Client.prototype.reread = function() {
		 this._send({ command: "reread" })
	}

	Client.prototype.eventObservable = function() {
		return this._observable;
	};

	return {
		Client: Client
	};
}();

