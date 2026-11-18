package com.agy.runtime;

import android.content.Context;
import android.util.Log;

import com.agy.util.AtomicFileWriter;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

/**
 * Materializes a fully-onboarded state before the core starts, so the Welcome
 * wizard is skipped. Idempotent and non-destructive: only writes when the
 * target is absent (or a zero-byte stub).
 */
public final class OnboardingSeeder {

    private static final String TAG = "OnboardingSeeder";

    private OnboardingSeeder() {
    }

    public static void seed(Context appContext, File appData, File projects) {
        try {
            if (!appData.exists() && !appData.mkdirs()) {
                Log.w(TAG, "cannot create " + appData);
                return;
            }
            seedStateFile(appContext, "jetski_state.pbtxt", new File(appData, "jetski_state.pbtxt"));
            seedStateFile(appContext, "antigravity_state.pbtxt",
                    new File(appData, "antigravity_state.pbtxt"));

            // Seed default agent rules (AGENTS.md) and config.json into ~/.gemini/config/
            File configDir = projects.getParentFile();
            if (configDir != null && (configDir.isDirectory() || configDir.mkdirs())) {
                seedStateFile(appContext, "AGENTS.md", new File(configDir, "AGENTS.md"));
                seedUserConfig(configDir);
            }

            // The project store resolves its projects here; without the
            // pseudo-project file it logs project_store_get_file_missing.
            if (!projects.exists() && !projects.mkdirs()) {
                Log.w(TAG, "cannot create " + projects);
                return;
            }
            File outside = new File(projects, "outside-of-project.json");
            if (!outside.isFile()) {
                AtomicFileWriter.writeText(outside, "{}\n");
            }
        } catch (Exception e) {
            Log.w(TAG, "onboarding seed failed (continuing): " + e.getMessage());
        }
    }

    /**
     * Ensures ~/.gemini/config/config.json disables the desktop Linux terminal sandbox
     * (which is unsupported on Android and causes `libloader.so: invalid argument`) and
     * allows terminal execution and non-workspace file access by default.
     */
    private static void seedUserConfig(File configDir) {
        try {
            File migrated = new File(configDir, ".migrated");
            if (!migrated.isFile()) {
                AtomicFileWriter.writeText(migrated, "");
            }

            File configFile = new File(configDir, "config.json");
            JSONObject root = new JSONObject();
            if (configFile.isFile() && configFile.length() > 0) {
                try (InputStream in = new FileInputStream(configFile)) {
                    String raw = com.agy.util.IoUtil.readAll(in, "UTF-8");
                    if (raw != null && !raw.trim().isEmpty()) {
                        root = new JSONObject(raw);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "could not parse existing config.json, recreating: " + e.getMessage());
                }
            }

            JSONObject userSettings = root.optJSONObject("userSettings");
            if (userSettings == null) {
                userSettings = new JSONObject();
                root.put("userSettings", userSettings);
            }

            // Always force enableTerminalSandbox = false on Android
            userSettings.put("enableTerminalSandbox", false);

            String autoExec = userSettings.optString("autoExecutionPolicy", "");
            if (autoExec.isEmpty()
                    || "CASCADE_COMMANDS_AUTO_EXECUTION_PROCEED_IN_SANDBOX".equals(autoExec)
                    || "CASCADE_COMMANDS_AUTO_EXECUTION_UNSPECIFIED".equals(autoExec)) {
                userSettings.put("autoExecutionPolicy", "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER");
            }

            String fileAccess = userSettings.optString("nonWorkspaceFileAccessPolicy", "");
            if (fileAccess.isEmpty() || "AGENT_SETTING_POLICY_UNSPECIFIED".equals(fileAccess)) {
                userSettings.put("nonWorkspaceFileAccessPolicy", "AGENT_SETTING_POLICY_ALLOW");
            }

            if (!userSettings.has("artifactReviewMode")) {
                userSettings.put("artifactReviewMode", "ARTIFACT_REVIEW_MODE_ALWAYS");
            }

            AtomicFileWriter.writeText(configFile, root.toString(2) + "\n");
        } catch (Exception e) {
            Log.w(TAG, "seedUserConfig failed: " + e.getMessage());
        }
    }

    private static void seedStateFile(Context appContext, String assetName, File target)
            throws Exception {
        if (target.isFile() && target.length() > 0) {
            Log.i(TAG, "state present; left untouched: " + target);
            return;
        }
        try (InputStream in = appContext.getAssets().open(
                RuntimePaths.SEED_ASSET + "/" + assetName)) {
            String content = com.agy.util.IoUtil.readAll(in, "UTF-8");
            AtomicFileWriter.writeText(target, content);
        }
        Log.i(TAG, "seeded onboarding state (was missing): " + target);
    }
}

