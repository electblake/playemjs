/**
 * tests for playemjs
 * @author adrienjoly
 **/

function forEachAsync(fcts, cb) {
	fcts = fcts || [];
	(function next(){
		var fct = fcts.shift();
		if (!fct)
			cb();
		else
			fct(next);
	})();
}

function PlayemLoader() {

	var DEFAULT_PLAYERS = [
		"Youtube",
		"SoundCloud",
		"Vimeo",
		"Dailymotion",
		"Deezer",
		"AudioFile",
		"Bandcamp",
	];

	var DEFAULT_PLAYER_PARAMS = {
		playerId: "genericplayer",
		origin: window.location.host || window.location.hostname,
		playerContainer: document.getElementById("container")
	};

	function load(players, playerParams, cb){
		var playem = new Playem();
		function makePlayerLoader(pl){
			return function(next) {
				function initPlayer(){
					playem.addPlayer(window[pl + "Player"], playerParams); // instanciates player class
					next();
				}
				console.log("Init " + pl + " player...");
				if (window[pl+"Player"]) // check that class exists
					initPlayer();
				else
					loader.includeJS("../playem-"+pl.toLowerCase()+".js?_t="+Date.now(), initPlayer);
			};
		}
		forEachAsync(players.map(makePlayerLoader), function(){
			cb(playem);
		});
	}

	this.loadAllPlayers = function(cb){
		load(DEFAULT_PLAYERS, DEFAULT_PLAYER_PARAMS, cb);
		return this;
	}
}

function PlayemLogger() {

	var EVENTS = [
		"onError",
		"onReady",
		"onBuffering",
		"onPlay",
		"onPaused",
		"onTrackInfo",
		"onTrackChange",
		"onEnd",
		"loadMore",
	];

	var self = this;
	this.log = []; // [[timestamp, tag, fct name, args...]]
	var listeners = [];
	var lastTypedEvent = {};

	function makeLogger(evt, handler){
		return function(){
			var entry = [ Date.now(), evt ].concat(Array.prototype.slice.call(arguments));
			self.log.push(entry);
			lastTypedEvent[evt] = entry;
			handler && handler(entry);
			for(var i in listeners)
				listeners[i](evt, arguments);
			return entry;
		};
	}
	this.listenTo = function(playem, handler){
		var handlers = {};
		for (i in EVENTS) {
			var evt = EVENTS[i];
			playem.on(evt, makeLogger(evt, handler));
		}
		playem.on("onError", function(e){
			console.warn("catched error", e);
		});
		return this;
	}
	this.addListener = function(fct){
		listeners.push(fct);
		return listeners.length-1;
	};
	this.removeListener = function(idx){
		listeners.splice(idx);
	};
	this.getLastTypedEvent = function(evt){
		return lastTypedEvent[evt];
	};
	this.until = function(evtNameList, cb, timeoutDelay, timeoutCb){
		var listenerId, timeout, that = this, evtNames = {}, i;
		if (typeof evtNameList == "string")
			evtNameList = [evtNameList];
		for(i in evtNameList)
			evtNames[evtNameList[i]] = true;
		function clean(){
			clearTimeout(timeout);
			that.removeListener(listenerId);
		}
		if (timeoutDelay)
			timeout = setTimeout(function(){
				// if the callbacks returns true, keeping waiting for the event
				if (!(timeoutCb || cb)())
					clean();
			}, timeoutDelay);
		listenerId = this.addListener(function(evt, data){
			if (evtNames[evt])
				// if the callbacks returns true, keeping waiting for the event
				if (!cb(evt, data))
					clean();
		});
	};
}

function PlayemWrapper(playem, logger) {
	function wrapMethod(fctName){
		return function(){
			logger(fctName, arguments);
			return playem[fctName].apply(playem, arguments);
		};
	}
	for (var i in playem)
		if (typeof playem[i] == "function")
			this[i] = wrapMethod(i);
	return this;
}

function TestUI(nbTracks, nbCommonTests){
	var self = this, trackNumber = 0, testNumber = 0;
	["eventLog", "testName", "progress", "trackUrl", "trackId", "playerName", "duration", "position"].map(function(field){
		self[field] = document.getElementById(field);
	});
	this.prependToLog = function(html){
		this.eventLog.innerHTML = html + "<br>" + this.eventLog.innerHTML;
	};
	this.set = function(field, html){
		this[field].innerHTML = html || "";
	};
	function onTrackChange(t){
		console.log("-> track", t.index, t.playerName, t.trackId);
		testNumber = 0;
		self.set("eventLog");
		self.set("progress", ++trackNumber + " / " + nbTracks);
		self.set("trackUrl", t.metadata.url);
		self.set("trackId", t.trackId);
		self.set("playerName", t.playerName);
	};
	function onTrackInfo(t){
		self.set("duration", t.trackDuration);
		self.set("position", t.trackPosition);
	};
	this.onNewTest = function(title){
		self.set("testName", "(" + ++testNumber + " / " + nbCommonTests + ") " + title);
	};
	this.onPlayerEvent = function(entry){
		//console.log(entry[1]);
		self.prependToLog("-> " + entry[1]);
	};
	this.wrapPlayem = function(playem){
		var playem = new PlayemWrapper(playem, function(fctName, arg){
			self.prependToLog("<- " + fctName + " " + arg[0]);
		});
		playem.on("onTrackChange", onTrackChange);
		playem.on("onTrackInfo", onTrackInfo);
		return playem;
	};
	return this;
}


function TestRunner(options) {

	var tests = [];
	var finalCallback = null;
	options = options || {};

	function emit(evtName, p){
		setTimeout(options[evtName] && options[evtName].bind(null, p));
	}

	function wrapTest(testFct, title){
		return function(nextTestFct){
			emit("onNewTest", title);
			console.log("%c[TEST] " + title + " ...", "color:#888");
			testFct(function(res){
				emit("onTestResult", !!res);
				console.log('%c[TEST]=> ' + (!!res ? "OK" : "FAIL: " + title), "color:" + (!!res ? "green" : "red"));
				if (!!res)
					setTimeout(nextTestFct);
				else
					finalCallback({ok: false, title: title});
			});
		};
	}

	this.addTests = function(testMap){
		for(var title in testMap)
			tests.push(wrapTest(testMap[title], title));
		return this;
	}

	this.run = function(cb){
		finalCallback = cb;
		forEachAsync(tests, function(){
			console.log("%cAll tests done!", "color:green");
			finalCallback({ok: true});
		});
		return this;
	}
}
