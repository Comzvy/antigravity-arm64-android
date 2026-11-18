(function(){
if (window.__AG_VOICE_INPUT_INSTALLED__) return;
window.__AG_VOICE_INPUT_INSTALLED__ = true;

var activeSessions = new Map();
var sessionCounter = 0;
var forceWebAudioMode = false;

function getBridgeToken() {
  return window.__AG_NATIVE_BRIDGE_TOKEN__ || "";
}

function getAndroid() {
  return window.Android || window.AndroidBridge || null;
}

function hasNativeVoiceBridge() {
  var a = getAndroid();
  return !!(a && typeof a.startVoiceRecognition === "function");
}

function isNativeSpeechAvailable() {
  var a = getAndroid();
  if (!a || typeof a.startVoiceRecognition !== "function") {
    return false;
  }
  try {
    if (typeof a.isVoiceRecognitionAvailable === "function") {
      return !!a.isVoiceRecognitionAvailable();
    }
  } catch (_) {}
  return true;
}

function shouldUseNativeMic() {
  return !forceWebAudioMode && isNativeSpeechAvailable();
}

function hasMicrophone() {
  if (hasNativeVoiceBridge()) {
    return true;
  }
  return !!(typeof navigator !== "undefined" && navigator.mediaDevices);
}

function uint8ToBase64(bytes) {
  var binary = "";
  var chunkSize = 0x8000;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}

function pcmChunksToWavBase64(chunks, sampleRate) {
  var rate = sampleRate || 16000;
  var totalLen = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalLen += chunks[i].byteLength;
  }
  if (totalLen === 0) {
    return "";
  }
  var wavBuffer = new ArrayBuffer(44 + totalLen);
  var view = new DataView(wavBuffer);

  function writeStr(offset, str) {
    for (var j = 0; j < str.length; j++) {
      view.setUint8(offset + j, str.charCodeAt(j));
    }
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);  // NumChannels (1 = mono)
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, "data");
  view.setUint32(40, totalLen, true);

  var out = new Uint8Array(wavBuffer);
  var offset = 44;
  for (var k = 0; k < chunks.length; k++) {
    out.set(chunks[k], offset);
    offset += chunks[k].byteLength;
  }
  return uint8ToBase64(out);
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function () {
      var res = String(reader.result || "");
      var idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = function (e) {
      reject(e);
    };
    reader.readAsDataURL(blob);
  });
}

function createAsyncEventQueue() {
  var items = [];
  var waiters = [];
  var closed = false;
  var closeError = null;

  return {
    push: function (item) {
      if (closed) return;
      if (waiters.length > 0) {
        var w = waiters.shift();
        w.resolve({ value: item, done: false });
      } else {
        items.push(item);
      }
    },
    close: function (err) {
      if (closed) return;
      closed = true;
      closeError = err || null;
      while (waiters.length > 0) {
        var w = waiters.shift();
        if (closeError) {
          w.reject(closeError);
        } else {
          w.resolve({ value: undefined, done: true });
        }
      }
    },
    iterator: (function () {
      var gen = {};
      gen.next = function () {
        if (items.length > 0) {
          return Promise.resolve({ value: items.shift(), done: false });
        }
        if (closed) {
          if (closeError) {
            return Promise.reject(closeError);
          }
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise(function (resolve, reject) {
          waiters.push({ resolve: resolve, reject: reject });
        });
      };
      gen.return = function () {
        closed = true;
        items.length = 0;
        return Promise.resolve({ value: undefined, done: true });
      };
      if (typeof Symbol !== "undefined" && Symbol.asyncIterator) {
        gen[Symbol.asyncIterator] = function () {
          return gen;
        };
      }
      return gen;
    })()
  };
}

function transcribeViaNativeBridge(base64Audio, mimeType) {
  return new Promise(function (resolve, reject) {
    var a = getAndroid();
    if (!a || typeof a.transcribeAudio !== "function") {
      reject(new Error("Native audio transcription bridge not available"));
      return;
    }
    setTimeout(function () {
      try {
        var raw = a.transcribeAudio(getBridgeToken(), base64Audio, mimeType || "audio/wav");
        var res = JSON.parse(raw || "{}");
        if (res && res.ok) {
          resolve(String(res.text || "").trim());
        } else {
          reject(new Error((res && res.error) || "Failed to transcribe audio"));
        }
      } catch (err) {
        reject(err);
      }
    }, 10);
  });
}

function startWebAudioMediaRecorderFallback(session) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    session.queue.close(new Error("Microphone is not available in this WebView"));
    activeSessions.delete(session.id);
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    if (session.aborted || session.stopped) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return;
    }
    session.mediaStream = stream;
    session.recorderChunks = [];
    var recorder = new MediaRecorder(stream);
    session.mediaRecorder = recorder;
    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) {
        session.recorderChunks.push(e.data);
      }
    };
    recorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (session.aborted) {
        session.queue.close();
        activeSessions.delete(session.id);
        return;
      }
      var mime = recorder.mimeType || "audio/webm";
      var blob = new Blob(session.recorderChunks, { type: mime });
      blobToBase64(blob).then(function (b64) {
        return transcribeViaNativeBridge(b64, mime);
      }).then(function (text) {
        if (text) {
          session.queue.push({
            message: {
              case: "transcription",
              value: { text: text, isFinal: true }
            }
          });
        }
        session.queue.push({
          message: { case: "complete", value: {} }
        });
        session.queue.close();
        activeSessions.delete(session.id);
      }).catch(function (err) {
        session.queue.close(err);
        activeSessions.delete(session.id);
      });
    };
    recorder.start();
  }).catch(function (err) {
    session.queue.close(err);
    activeSessions.delete(session.id);
  });
}

var voiceHudEl = null;
var voiceHudTextEl = null;

function ensureVoiceHud() {
  if (voiceHudEl) return voiceHudEl;
  if (!document.body) return null;

  if (!document.getElementById("agy-voice-hud-styles")) {
    var st = document.createElement("style");
    st.id = "agy-voice-hud-styles";
    st.textContent = [
      ".agy-voice-hud {",
      "  position: fixed; left: 50%; bottom: 72px; transform: translateX(-50%); z-index: 99995;",
      "  max-width: min(92vw, 480px); min-width: 220px; padding: 10px 14px;",
      "  border-radius: 999px; background: rgba(15, 23, 42, 0.94); color: #f8fafc;",
      "  border: 1px solid rgba(56, 189, 248, 0.45);",
      "  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);",
      "  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);",
      "  display: none; align-items: center; gap: 10px; font-size: 13px; font-weight: 500;",
      "}",
      "html.light .agy-voice-hud {",
      "  background: rgba(255, 255, 255, 0.96); color: #0f172a;",
      "  border-color: rgba(2, 132, 199, 0.4);",
      "}",
      ".agy-voice-hud.active { display: inline-flex; }",
      ".agy-voice-pulse {",
      "  width: 10px; height: 10px; border-radius: 50%; background: #ef4444; flex-shrink: 0;",
      "  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);",
      "  animation: agyVoicePulse 1.25s infinite;",
      "}",
      "@keyframes agyVoicePulse {",
      "  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }",
      "  70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }",
      "  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }",
      "}",
      ".agy-voice-hud-text {",
      "  flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }

  var hud = document.createElement("div");
  hud.className = "agy-voice-hud";
  var dot = document.createElement("span");
  dot.className = "agy-voice-pulse";
  var txt = document.createElement("span");
  txt.className = "agy-voice-hud-text";
  txt.textContent = "Listening...";
  hud.appendChild(dot);
  hud.appendChild(txt);
  document.body.appendChild(hud);
  voiceHudEl = hud;
  voiceHudTextEl = txt;
  return hud;
}

function showVoiceHud(text) {
  try {
    var hud = ensureVoiceHud();
    if (!hud) return;
    if (voiceHudTextEl) {
      voiceHudTextEl.textContent = text || "Listening...";
    }
    hud.classList.add("active");
  } catch (_) {}
}

function hideVoiceHud() {
  try {
    if (voiceHudEl) {
      voiceHudEl.classList.remove("active");
    }
  } catch (_) {}
}

window.__onAgVoiceEvent = function (ev) {
  if (!ev || !ev.sessionId) return;
  var session = activeSessions.get(ev.sessionId);
  if (!session) return;

  if (ev.type === "ready") {
    showVoiceHud("Listening... speak now");
    if (!session.readySent) {
      session.readySent = true;
      session.queue.push({
        message: {
          case: "ready",
          value: { sessionId: session.id }
        }
      });
    }
    return;
  }

  if (ev.type === "partial") {
    var partialText = String(ev.text || "");
    session.lastText = partialText;
    if (partialText) {
      showVoiceHud("🎙️ " + partialText);
    }
    session.queue.push({
      message: {
        case: "transcription",
        value: { text: partialText, isFinal: false }
      }
    });
    if (session.onSpeechRecognitionResult) {
      session.onSpeechRecognitionResult(partialText, false);
    }
    return;
  }

  if (ev.type === "final_segment") {
    var segText = String(ev.text || "").trim();
    if (segText) {
      showVoiceHud("✓ " + segText);
      session.queue.push({
        message: {
          case: "transcription",
          value: { text: segText, isFinal: true }
        }
      });
      if (session.onSpeechRecognitionResult) {
        session.onSpeechRecognitionResult(segText, true);
      }
    }
    return;
  }

  if (ev.type === "final") {
    var finalText = String(ev.text || "").trim();
    session.finalSent = true;
    if (finalText) {
      session.lastText = finalText;
      showVoiceHud("✓ " + finalText);
      session.queue.push({
        message: {
          case: "transcription",
          value: { text: finalText, isFinal: true }
        }
      });
      if (session.onSpeechRecognitionResult) {
        session.onSpeechRecognitionResult(finalText, true);
      }
    }
    return;
  }

  if (ev.type === "complete") {
    hideVoiceHud();
    if (!session.continuous && !session.finalSent && session.lastText && session.lastText.trim()) {
      session.finalSent = true;
      session.queue.push({
        message: {
          case: "transcription",
          value: { text: session.lastText.trim(), isFinal: true }
        }
      });
    }
    session.queue.push({
      message: {
        case: "complete",
        value: {}
      }
    });
    session.queue.close();
    if (session.onSpeechRecognitionEnd) {
      session.onSpeechRecognitionEnd();
    }
    activeSessions.delete(session.id);
    return;
  }

  if (ev.type === "fallback_webaudio") {
    showVoiceHud("Recording audio (Cloud STT)...");
    session.usingWebAudioFallback = true;
    startWebAudioMediaRecorderFallback(session);
    return;
  }

  if (ev.type === "error") {
    hideVoiceHud();
    var errMsg = ev.error || "Voice recognition failed";
    if (session.onSpeechRecognitionError) {
      session.onSpeechRecognitionError(errMsg);
    }
    session.queue.close(new Error(errMsg));
    activeSessions.delete(session.id);
  }
};

function streamAudioTranscription(req, opts, fallbackFn) {
  var a = getAndroid();
  if (!a || typeof a.startVoiceRecognition !== "function") {
    if (typeof fallbackFn === "function") {
      return fallbackFn();
    }
  }

  var sessionId = "ag-voice-" + (++sessionCounter) + "-" + Date.now();
  var queue = createAsyncEventQueue();
  var continuous = !!(req && req.continuous);
  var session = {
    id: sessionId,
    continuous: continuous,
    queue: queue,
    readySent: false,
    finalSent: false,
    lastText: "",
    pcmChunks: [],
    aborted: false,
    stopped: false,
    usingWebAudioFallback: !shouldUseNativeMic(),
    mediaRecorder: null,
    mediaStream: null,
    recorderChunks: []
  };
  activeSessions.set(sessionId, session);

  if (opts && opts.signal) {
    opts.signal.addEventListener("abort", function () {
      hideVoiceHud();
      session.aborted = true;
      activeSessions.delete(sessionId);
      if (session.mediaRecorder && session.mediaRecorder.state !== "inactive") {
        try { session.mediaRecorder.stop(); } catch (_) {}
      }
      if (session.mediaStream) {
        try {
          session.mediaStream.getTracks().forEach(function (t) { t.stop(); });
        } catch (_) {}
      }
      try {
        if (a && typeof a.cancelVoiceRecognition === "function") {
          a.cancelVoiceRecognition(getBridgeToken(), sessionId);
        }
      } catch (_) {}
      queue.close();
    }, { once: true });
  }

  session.readySent = true;
  queue.push({
    message: {
      case: "ready",
      value: { sessionId: sessionId }
    }
  });

  if (shouldUseNativeMic()) {
    try {
      var started = a.startVoiceRecognition(getBridgeToken(), sessionId, continuous, "auto");
      if (!started) {
        session.usingWebAudioFallback = true;
        startWebAudioMediaRecorderFallback(session);
      }
    } catch (err) {
      session.usingWebAudioFallback = true;
      startWebAudioMediaRecorderFallback(session);
    }
  }

  return queue.iterator;
}

function sendAudioChunk(req, fallbackFn) {
  var sid = req && req.sessionId;
  var session = sid ? activeSessions.get(sid) : null;
  if (!session) {
    if (typeof fallbackFn === "function") {
      return fallbackFn();
    }
    return Promise.resolve({});
  }
  if (req && req.data) {
    var bytes = req.data instanceof Uint8Array ? req.data : new Uint8Array(req.data);
    if (bytes.byteLength > 0) {
      session.pcmChunks.push(bytes);
    }
  }
  return Promise.resolve({});
}

function endAudioSession(req, fallbackFn) {
  var sid = req && req.sessionId;
  var session = sid ? activeSessions.get(sid) : null;
  if (!session) {
    hideVoiceHud();
    if (typeof fallbackFn === "function") {
      return fallbackFn();
    }
    return Promise.resolve({});
  }
  session.stopped = true;

  if (session.mediaRecorder && session.mediaRecorder.state !== "inactive") {
    showVoiceHud("Processing voice transcription...");
    try {
      session.mediaRecorder.stop();
    } catch (_) {
      hideVoiceHud();
    }
    return Promise.resolve({});
  }

  if (session.usingWebAudioFallback && session.pcmChunks.length > 0) {
    showVoiceHud("Processing voice transcription...");
    var wavB64 = pcmChunksToWavBase64(session.pcmChunks, 16000);
    session.pcmChunks = [];
    if (!wavB64) {
      hideVoiceHud();
      session.queue.push({ message: { case: "complete", value: {} } });
      session.queue.close();
      activeSessions.delete(session.id);
      return Promise.resolve({});
    }
    return transcribeViaNativeBridge(wavB64, "audio/wav").then(function (text) {
      hideVoiceHud();
      if (text) {
        session.queue.push({
          message: {
            case: "transcription",
            value: { text: text, isFinal: true }
          }
        });
      }
      session.queue.push({ message: { case: "complete", value: {} } });
      session.queue.close();
      activeSessions.delete(session.id);
      return {};
    }).catch(function (err) {
      hideVoiceHud();
      session.queue.close(err);
      activeSessions.delete(session.id);
      throw err;
    });
  }

  var a = getAndroid();
  if (a && typeof a.stopVoiceRecognition === "function") {
    try {
      a.stopVoiceRecognition(getBridgeToken(), session.id);
    } catch (_) {
      hideVoiceHud();
      session.queue.push({ message: { case: "complete", value: {} } });
      session.queue.close();
      activeSessions.delete(session.id);
    }
  } else {
    hideVoiceHud();
    session.queue.push({ message: { case: "complete", value: {} } });
    session.queue.close();
    activeSessions.delete(session.id);
  }
  return Promise.resolve({});
}

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

var voiceBridgeApi = {
  installed: true,
  hasMicrophone: hasMicrophone,
  shouldUseNativeMic: shouldUseNativeMic,
  isNativeSpeechAvailable: isNativeSpeechAvailable,
  streamAudioTranscription: streamAudioTranscription,
  sendAudioChunk: sendAudioChunk,
  endAudioSession: endAudioSession,
  speak: function (text, lang) {
    if (window.speechSynthesis) {
      window.speechSynthesis.speak({ text: text, lang: lang || "" });
    }
  },
  stopSpeaking: function () {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
};

window.__agVoiceBridge = voiceBridgeApi;
window.AGY = window.AGY || {};
window.AGY.voiceInput = voiceBridgeApi;


})();
