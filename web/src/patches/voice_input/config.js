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
