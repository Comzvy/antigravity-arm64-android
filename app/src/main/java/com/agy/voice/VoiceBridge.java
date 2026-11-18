package com.agy.voice;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.text.TextUtils;
import android.util.Log;
import android.webkit.WebView;

import com.agy.ui.MainActivity;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Native Android Voice-to-Text (SpeechRecognizer + RecognizerIntent fallback)
 * and Text-to-Speech (TTS) bridge for the Antigravity WebView UI.
 */
public final class VoiceBridge {

    private static final String TAG = "VoiceBridge";
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    private static SpeechRecognizer speechRecognizer;
    private static String activeSessionId = null;
    private static boolean activeContinuous = false;
    private static String activeLang = null;
    private static boolean isListening = false;
    private static boolean stopRequested = false;
    private static boolean hasReceivedAnySpeech = false;
    private static boolean usingActivityDialog = false;
    private static final StringBuilder accumulatedTranscript = new StringBuilder();
    private static String lastPartialSegment = "";

    private static TextToSpeech ttsEngine;
    private static boolean ttsReady = false;
    private static String pendingTtsText = null;
    private static String pendingTtsLang = null;

    private VoiceBridge() {
    }

    public static boolean isRecognitionAvailable(Context context) {
        if (context == null) {
            return false;
        }
        try {
            if (SpeechRecognizer.isRecognitionAvailable(context)) {
                return true;
            }
        } catch (Throwable ignored) {
        }
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            return intent.resolveActivity(context.getPackageManager()) != null;
        } catch (Throwable ignored) {
            return true;
        }
    }

    public static void startListening(final MainActivity activity,
                                      final String sessionId,
                                      final boolean continuous,
                                      final String lang) {
        if (activity == null) {
            return;
        }
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                activity.ensureRecordAudioPermission(new Runnable() {
                    @Override
                    public void run() {
                        startListeningInternal(activity, sessionId, continuous, lang);
                    }
                }, new Runnable() {
                    @Override
                    public void run() {
                        emitEvent(activity, sessionId, "error", null,
                                "Microphone permission (RECORD_AUDIO) denied. Please enable microphone access in App Settings.");
                    }
                });
            }
        });
    }

    private static void startListeningInternal(final MainActivity activity,
                                               final String sessionId,
                                               final boolean continuous,
                                               final String lang) {
        destroyRecognizerInternal();

        activeSessionId = sessionId;
        activeContinuous = continuous;
        activeLang = lang;
        isListening = true;
        stopRequested = false;
        hasReceivedAnySpeech = false;
        usingActivityDialog = false;
        accumulatedTranscript.setLength(0);
        lastPartialSegment = "";

        boolean serviceAvailable = false;
        try {
            serviceAvailable = SpeechRecognizer.isRecognitionAvailable(activity);
        } catch (Throwable t) {
            Log.w(TAG, "isRecognitionAvailable check failed: " + t.getMessage());
        }

        if (!serviceAvailable) {
            Log.i(TAG, "SpeechRecognizer service not directly available; trying RecognizerIntent activity");
            if (launchRecognizerActivity(activity, sessionId, lang)) {
                return;
            }
            emitEvent(activity, sessionId, "fallback_webaudio", null,
                    "Native SpeechRecognizer service unavailable");
            return;
        }

        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(activity.getApplicationContext());
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    emitEvent(activity, sessionId, "ready", null, null);
                }

                @Override
                public void onBeginningOfSpeech() {
                    hasReceivedAnySpeech = true;
                }

                @Override
                public void onRmsChanged(float rmsdB) {
                }

                @Override
                public void onBufferReceived(byte[] buffer) {
                }

                @Override
                public void onEndOfSpeech() {
                }

                @Override
                public void onError(int error) {
                    if (!TextUtils.equals(activeSessionId, sessionId)) {
                        return;
                    }
                    Log.w(TAG, "SpeechRecognizer onError: " + error + " (stopRequested=" + stopRequested + ")");

                    // Silence / timeout while user still has mic open: seamlessly restart listening
                    if (error == SpeechRecognizer.ERROR_NO_MATCH
                            || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        if (isListening && !stopRequested) {
                            restartSegmentListening(activity, sessionId);
                            return;
                        }
                        finishSessionSuccess(activity, sessionId);
                        return;
                    }

                    // If stop was already requested, finalize whatever transcript we have
                    if (stopRequested || accumulatedTranscript.length() > 0 || !TextUtils.isEmpty(lastPartialSegment)) {
                        finishSessionSuccess(activity, sessionId);
                        return;
                    }

                    // If SpeechRecognizer failed before any speech was captured (e.g. OEM restriction),
                    // try launching the system voice recognition dialog or fallback to WebAudio
                    destroyRecognizerInternal();
                    if (!usingActivityDialog && launchRecognizerActivity(activity, sessionId, activeLang)) {
                        return;
                    }
                    emitEvent(activity, sessionId, "fallback_webaudio", null,
                            mapErrorMessage(error));
                }

                @Override
                public void onResults(Bundle results) {
                    if (!TextUtils.equals(activeSessionId, sessionId)) {
                        return;
                    }
                    String segment = extractBestMatch(results);
                    if (TextUtils.isEmpty(segment)) {
                        segment = lastPartialSegment;
                    }
                    lastPartialSegment = "";

                    if (!TextUtils.isEmpty(segment)) {
                        hasReceivedAnySpeech = true;
                        if (activeContinuous) {
                            emitEvent(activity, sessionId, "final_segment", segment.trim(), null);
                        } else {
                            appendSegment(segment);
                            emitEvent(activity, sessionId, "partial", accumulatedTranscript.toString(), null);
                        }
                    }

                    if (isListening && !stopRequested) {
                        restartSegmentListening(activity, sessionId);
                    } else {
                        finishSessionSuccess(activity, sessionId);
                    }
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    if (!TextUtils.equals(activeSessionId, sessionId)) {
                        return;
                    }
                    String partial = extractBestMatch(partialResults);
                    if (TextUtils.isEmpty(partial)) {
                        return;
                    }
                    hasReceivedAnySpeech = true;
                    lastPartialSegment = partial;
                    String combined = buildCombinedPreview(partial);
                    emitEvent(activity, sessionId, "partial", combined, null);
                }

                @Override
                public void onEvent(int eventType, Bundle params) {
                }
            });

            emitEvent(activity, sessionId, "ready", null, null);
            speechRecognizer.startListening(buildRecognizerIntent(activity, lang));
        } catch (Throwable t) {
            Log.e(TAG, "Failed to start SpeechRecognizer: " + t.getMessage(), t);
            destroyRecognizerInternal();
            if (launchRecognizerActivity(activity, sessionId, lang)) {
                return;
            }
            emitEvent(activity, sessionId, "fallback_webaudio", null, t.getMessage());
        }
    }

    private static void restartSegmentListening(final MainActivity activity, final String sessionId) {
        MAIN_HANDLER.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (!isListening || stopRequested || !TextUtils.equals(activeSessionId, sessionId)) {
                    return;
                }
                try {
                    if (speechRecognizer != null) {
                        speechRecognizer.cancel();
                        speechRecognizer.startListening(buildRecognizerIntent(activity, activeLang));
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "Failed to restart segment listening: " + t.getMessage());
                    finishSessionSuccess(activity, sessionId);
                }
            }
        }, 80);
    }

    public static void stopListening(final MainActivity activity, final String sessionId) {
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                if (activeSessionId == null) {
                    return;
                }
                final String targetSession = !TextUtils.isEmpty(sessionId) ? sessionId : activeSessionId;
                stopRequested = true;
                isListening = false;
                if (usingActivityDialog) {
                    return;
                }
                if (speechRecognizer != null) {
                    try {
                        speechRecognizer.stopListening();
                    } catch (Throwable ignored) {
                    }
                    // Safety timeout in case onResults is not called after stopListening()
                    MAIN_HANDLER.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (TextUtils.equals(activeSessionId, targetSession)) {
                                finishSessionSuccess(activity, targetSession);
                            }
                        }
                    }, 600);
                } else {
                    finishSessionSuccess(activity, targetSession);
                }
            }
        });
    }

    public static void cancelListening(final MainActivity activity, final String sessionId) {
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                stopRequested = true;
                isListening = false;
                activeSessionId = null;
                accumulatedTranscript.setLength(0);
                lastPartialSegment = "";
                destroyRecognizerInternal();
            }
        });
    }

    public static void onActivityRecognitionResult(MainActivity activity, int resultCode, Intent data) {
        final String sessionId = activeSessionId;
        if (TextUtils.isEmpty(sessionId)) {
            return;
        }
        usingActivityDialog = false;
        isListening = false;
        stopRequested = true;
        if (resultCode == android.app.Activity.RESULT_OK && data != null) {
            ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty() && !TextUtils.isEmpty(matches.get(0))) {
                appendSegment(matches.get(0));
            }
        }
        finishSessionSuccess(activity, sessionId);
    }

    private static boolean launchRecognizerActivity(MainActivity activity, String sessionId, String lang) {
        try {
            Intent intent = buildRecognizerIntent(activity, lang);
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak now...");
            if (intent.resolveActivity(activity.getPackageManager()) != null) {
                usingActivityDialog = true;
                emitEvent(activity, sessionId, "ready", null, null);
                activity.startActivityForResult(intent, MainActivity.REQUEST_VOICE_RECOGNITION);
                return true;
            }
        } catch (Throwable t) {
            Log.w(TAG, "launchRecognizerActivity failed: " + t.getMessage());
        }
        return false;
    }

    private static void finishSessionSuccess(MainActivity activity, String sessionId) {
        if (!TextUtils.equals(activeSessionId, sessionId)) {
            return;
        }
        if (!TextUtils.isEmpty(lastPartialSegment)) {
            if (activeContinuous) {
                emitEvent(activity, sessionId, "final_segment", lastPartialSegment.trim(), null);
            } else {
                appendSegment(lastPartialSegment);
            }
            lastPartialSegment = "";
        }
        String finalText = accumulatedTranscript.toString().trim();
        if (!activeContinuous && !TextUtils.isEmpty(finalText)) {
            emitEvent(activity, sessionId, "final", finalText, null);
        }
        emitEvent(activity, sessionId, "complete", finalText, null);
        activeSessionId = null;
        isListening = false;
        stopRequested = false;
        accumulatedTranscript.setLength(0);
        destroyRecognizerInternal();
    }

    private static void destroyRecognizerInternal() {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
            } catch (Throwable ignored) {
            }
            try {
                speechRecognizer.destroy();
            } catch (Throwable ignored) {
            }
            speechRecognizer = null;
        }
    }

    private static Intent buildRecognizerIntent(Context context, String lang) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());
        if (!TextUtils.isEmpty(lang) && !"auto".equalsIgnoreCase(lang)) {
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        }
        return intent;
    }

    private static String extractBestMatch(Bundle bundle) {
        if (bundle == null) {
            return "";
        }
        ArrayList<String> matches = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches != null && !matches.isEmpty()) {
            for (String m : matches) {
                if (m != null && !m.trim().isEmpty()) {
                    return m.trim();
                }
            }
        }
        return "";
    }

    private static void appendSegment(String segment) {
        if (TextUtils.isEmpty(segment)) {
            return;
        }
        String trimmed = segment.trim();
        if (trimmed.isEmpty()) {
            return;
        }
        if (accumulatedTranscript.length() > 0
                && accumulatedTranscript.charAt(accumulatedTranscript.length() - 1) != ' ') {
            accumulatedTranscript.append(' ');
        }
        accumulatedTranscript.append(trimmed);
    }

    private static String buildCombinedPreview(String partial) {
        if (accumulatedTranscript.length() == 0) {
            return partial != null ? partial.trim() : "";
        }
        if (TextUtils.isEmpty(partial)) {
            return accumulatedTranscript.toString();
        }
        return accumulatedTranscript.toString() + " " + partial.trim();
    }

    private static String mapErrorMessage(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:
                return "Failed to record audio from microphone";
            case SpeechRecognizer.ERROR_CLIENT:
                return "Client speech recognition service unavailable";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Microphone permission not granted";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Network error during voice recognition";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "No speech detected";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Voice recognition service is busy";
            case SpeechRecognizer.ERROR_SERVER:
                return "Voice recognition server error";
            default:
                return "Voice recognition failed (code " + error + ")";
        }
    }

    private static void emitEvent(final MainActivity activity,
                                  final String sessionId,
                                  final String type,
                                  final String text,
                                  final String error) {
        if (activity == null) {
            return;
        }
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                WebView wv = activity.getWebView();
                if (wv == null) {
                    return;
                }
                try {
                    JSONObject ev = new JSONObject();
                    ev.put("sessionId", sessionId != null ? sessionId : "");
                    ev.put("type", type != null ? type : "");
                    if (text != null) {
                        ev.put("text", text);
                    }
                    if (error != null) {
                        ev.put("error", error);
                    }
                    String js = "window.__onAgVoiceEvent && window.__onAgVoiceEvent(" + ev.toString() + ");";
                    wv.evaluateJavascript(js, null);
                } catch (Throwable t) {
                    Log.w(TAG, "emitEvent failed: " + t.getMessage());
                }
            }
        });
    }

    /** Speaks text aloud using Android's native TextToSpeech engine. */
    public static void speakText(final Context context, final String text, final String lang) {
        if (context == null || TextUtils.isEmpty(text)) {
            return;
        }
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                if (ttsEngine == null) {
                    pendingTtsText = text;
                    pendingTtsLang = lang;
                    ttsEngine = new TextToSpeech(context.getApplicationContext(), new TextToSpeech.OnInitListener() {
                        @Override
                        public void onInit(int status) {
                            if (status == TextToSpeech.SUCCESS) {
                                ttsReady = true;
                                if (pendingTtsText != null) {
                                    String t = pendingTtsText;
                                    String l = pendingTtsLang;
                                    pendingTtsText = null;
                                    pendingTtsLang = null;
                                    speakTextInternal(t, l);
                                }
                            }
                        }
                    });
                } else if (ttsReady) {
                    speakTextInternal(text, lang);
                } else {
                    pendingTtsText = text;
                    pendingTtsLang = lang;
                }
            }
        });
    }

    private static void speakTextInternal(String text, String lang) {
        if (ttsEngine == null || !ttsReady) {
            return;
        }
        try {
            if (!TextUtils.isEmpty(lang)) {
                Locale loc = Locale.forLanguageTag(lang);
                ttsEngine.setLanguage(loc);
            } else {
                ttsEngine.setLanguage(Locale.getDefault());
            }
            ttsEngine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "agy-tts-" + System.currentTimeMillis());
        } catch (Throwable t) {
            Log.w(TAG, "speakTextInternal failed: " + t.getMessage());
        }
    }

    public static void stopSpeaking() {
        MAIN_HANDLER.post(new Runnable() {
            @Override
            public void run() {
                pendingTtsText = null;
                if (ttsEngine != null) {
                    try {
                        ttsEngine.stop();
                    } catch (Throwable ignored) {
                    }
                }
            }
        });
    }
}
