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
