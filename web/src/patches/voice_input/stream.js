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
