function installWebSpeechPolyfills() {
  if (typeof window === "undefined") return;

  // 1. SpeechRecognition / webkitSpeechRecognition polyfill for Android WebView
  if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
    var AgySpeechRecognition = function () {
      this.continuous = false;
      this.interimResults = true;
      this.lang = "";
      this.maxAlternatives = 1;
      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this._sessionId = null;
    };

    AgySpeechRecognition.prototype.start = function () {
      var self = this;
      var a = getAndroid();
      if (!a || typeof a.startVoiceRecognition !== "function") {
        if (typeof self.onerror === "function") {
          self.onerror({ error: "not-allowed", message: "Native voice bridge unavailable" });
        }
        return;
      }
      var sid = "ag-webspeech-" + (++sessionCounter) + "-" + Date.now();
      self._sessionId = sid;
      var queue = createAsyncEventQueue();
      var session = {
        id: sid,
        continuous: !!self.continuous,
        queue: queue,
        readySent: false,
        finalSent: false,
        lastText: "",
        pcmChunks: [],
        aborted: false,
        stopped: false,
        onSpeechRecognitionResult: function (text, isFinal) {
          if (typeof self.onresult === "function") {
            var item = { transcript: text, confidence: 0.98 };
            var res = [item];
            res.isFinal = !!isFinal;
            self.onresult({
              resultIndex: 0,
              results: [res]
            });
          }
        },
        onSpeechRecognitionEnd: function () {
          if (typeof self.onend === "function") {
            self.onend({});
          }
        },
        onSpeechRecognitionError: function (msg) {
          if (typeof self.onerror === "function") {
            self.onerror({ error: "audio-capture", message: msg });
          }
        }
      };
      activeSessions.set(sid, session);
      a.startVoiceRecognition(getBridgeToken(), sid, !!self.continuous, self.lang || "auto");
      if (typeof self.onstart === "function") {
        self.onstart({});
      }
    };

    AgySpeechRecognition.prototype.stop = function () {
      if (!this._sessionId) return;
      var a = getAndroid();
      if (a && typeof a.stopVoiceRecognition === "function") {
        a.stopVoiceRecognition(getBridgeToken(), this._sessionId);
      }
    };

    AgySpeechRecognition.prototype.abort = function () {
      if (!this._sessionId) return;
      var a = getAndroid();
      if (a && typeof a.cancelVoiceRecognition === "function") {
        a.cancelVoiceRecognition(getBridgeToken(), this._sessionId);
      }
      activeSessions.delete(this._sessionId);
      this._sessionId = null;
    };

    window.SpeechRecognition = AgySpeechRecognition;
    window.webkitSpeechRecognition = AgySpeechRecognition;
  }

  // 2. speechSynthesis / SpeechSynthesisUtterance polyfill for Android WebView
  if (!window.SpeechSynthesisUtterance) {
    window.SpeechSynthesisUtterance = function (text) {
      this.text = text || "";
      this.lang = "";
      this.rate = 1.0;
      this.pitch = 1.0;
      this.volume = 1.0;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    };
  }

  if (!window.speechSynthesis) {
    window.speechSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      speak: function (utterance) {
        var text = typeof utterance === "string" ? utterance : (utterance && utterance.text) || "";
        var lang = (utterance && utterance.lang) || "";
        var a = getAndroid();
        if (a && typeof a.speakText === "function" && text) {
          this.speaking = true;
          if (utterance && typeof utterance.onstart === "function") {
            try { utterance.onstart({}); } catch (_) {}
          }
          a.speakText(getBridgeToken(), text, lang);
          var self = this;
          setTimeout(function () {
            self.speaking = false;
            if (utterance && typeof utterance.onend === "function") {
              try { utterance.onend({}); } catch (_) {}
            }
          }, Math.min(15000, Math.max(800, text.length * 65)));
        }
      },
      cancel: function () {
        this.speaking = false;
        var a = getAndroid();
        if (a && typeof a.stopSpeaking === "function") {
          a.stopSpeaking(getBridgeToken());
        }
      },
      pause: function () {},
      resume: function () {},
      getVoices: function () { return []; }
    };
  }
}

installWebSpeechPolyfills();
