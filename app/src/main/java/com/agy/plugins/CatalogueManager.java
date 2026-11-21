package com.agy.plugins;

import android.content.Context;
import android.text.TextUtils;
import android.util.Log;

import com.agy.install.TarExtractor;
import com.agy.util.AtomicFileWriter;
import com.agy.util.FileModeUtil;
import com.agy.util.PathSafety;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Native installer, registry, and remover for Antigravity Skills and Plugins
 * under ~/.gemini/config/skills and ~/.gemini/config/plugins.
 */
public final class CatalogueManager {

    public interface EventEmitter {
        void emit(String jobId, String id, boolean isPlugin, String status, String message, boolean done, boolean ok);
    }

    private static final String TAG = "CatalogueManager";
    private static final String RTK_RELEASE_TAR_GZ =
            "https://github.com/rtk-ai/rtk/releases/latest/download/rtk-aarch64-unknown-linux-musl.tar.gz";
    private static final String RTK_RULES_AGENTS_MD =
            "# Command output\n\n"
                    + "Command output here is condensed to save tokens, keeping every signal and dropping costly noise. "
                    + "Treat it as the complete result: run commands normally, and batch related commands into one call to avoid extra turns. "
                    + "Truncated results state their recovery path in their own output. "
                    + "Re-run a command as `rtk bypass <cmd>` only when its result is unusable: empty when output was clearly expected, contradicting its exit code, or garbled.\n";

    private static final ConcurrentHashMap<String, Boolean> ACTIVE_JOBS = new ConcurrentHashMap<>();

    private CatalogueManager() {
    }

    public static File getSkillsDir(Context context) {
        return new File(context.getFilesDir(), ".gemini/config/skills");
    }

    public static File getPluginsDir(Context context) {
        return new File(context.getFilesDir(), ".gemini/config/plugins");
    }

    public static File getBuiltinSkillsDir(Context context) {
        return new File(context.getFilesDir(), ".gemini/antigravity-app/builtin/skills");
    }

    public static String listInstalledJson(Context context) {
        JSONObject resp = new JSONObject();
        try {
            resp.put("ok", true);
            resp.put("plugins", toJsonArray(listSubdirNames(getPluginsDir(context), false)));
            resp.put("skills", toJsonArray(listSubdirNames(getSkillsDir(context), true)));
            resp.put("builtinSkills", toJsonArray(listSubdirNames(getBuiltinSkillsDir(context), false)));
        } catch (Exception e) {
            try {
                resp.put("ok", false);
                resp.put("error", e.getMessage());
            } catch (Exception ignored) {
            }
        }
        return resp.toString();
    }

    private static List<String> listSubdirNames(File dir, boolean requireNonEmptyOrSkillMd) {
        List<String> names = new ArrayList<>();
        if (dir == null || !dir.isDirectory()) {
            return names;
        }
        File[] children = dir.listFiles();
        if (children == null) {
            return names;
        }
        for (File child : children) {
            if (!child.isDirectory()) {
                continue;
            }
            String name = child.getName();
            if (name.startsWith(".") || name.startsWith("plugin-clone-")
                    || name.startsWith("skill-clone-") || name.startsWith("slop-tmp-")) {
                continue;
            }
            if (requireNonEmptyOrSkillMd) {
                File skillMd = new File(child, "SKILL.md");
                File[] inner = child.listFiles();
                if (!skillMd.isFile() && (inner == null || inner.length == 0)) {
                    continue;
                }
            }
            names.add(name);
        }
        Collections.sort(names);
        return names;
    }

    private static JSONArray toJsonArray(List<String> items) {
        JSONArray arr = new JSONArray();
        for (String item : items) {
            arr.put(item);
        }
        return arr;
    }

    public static String sanitizeId(String rawId) {
        if (rawId == null) {
            return "";
        }
        String cleaned = rawId.trim().replaceAll("[^a-zA-Z0-9._-]", "");
        if (cleaned.isEmpty() || ".".equals(cleaned) || "..".equals(cleaned) || cleaned.contains("..")) {
            return "";
        }
        return cleaned;
    }

    public static String installAsync(final Context context, final String itemJson, final EventEmitter emitter) {
        JSONObject out = new JSONObject();
        try {
            final JSONObject req = new JSONObject(itemJson);
            final String safeId = sanitizeId(req.optString("id", ""));
            final String name = req.optString("name", safeId);
            final String description = req.optString("description", "");
            final boolean isPlugin = req.optBoolean("isPlugin", false);
            final String repoUrl = req.optString("repoUrl", "").trim();
            final String subPath = req.optString("subPath", "").trim();

            if (safeId.isEmpty()) {
                out.put("ok", false);
                out.put("error", "Invalid item id");
                return out.toString();
            }

            final String lockKey = (isPlugin ? "plugin:" : "skill:") + safeId;
            if (ACTIVE_JOBS.putIfAbsent(lockKey, Boolean.TRUE) != null) {
                out.put("ok", false);
                out.put("error", "Installation already in progress for " + safeId);
                return out.toString();
            }

            final String jobId = UUID.randomUUID().toString();
            final Context appCtx = context.getApplicationContext();

            Thread worker = new Thread(() -> {
                try {
                    emitSafe(emitter, jobId, safeId, isPlugin, "starting",
                            "Starting installation of " + name + "...", false, true);
                    if (isPlugin) {
                        installPlugin(appCtx, jobId, safeId, name, description, repoUrl, emitter);
                    } else {
                        installSkill(appCtx, jobId, safeId, name, description, repoUrl, subPath, emitter);
                    }
                    emitSafe(emitter, jobId, safeId, isPlugin, "done",
                            (isPlugin ? "Plugin " : "Skill ") + name + " installed and ready.", true, true);
                } catch (Throwable t) {
                    Log.e(TAG, "Install failed for " + safeId + ": " + t.getMessage(), t);
                    String err = t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName();
                    emitSafe(emitter, jobId, safeId, isPlugin, "error", "Failed: " + err, true, false);
                } finally {
                    ACTIVE_JOBS.remove(lockKey);
                }
            }, "CatalogueInstaller-" + safeId);
            worker.start();

            out.put("ok", true);
            out.put("jobId", jobId);
            out.put("id", safeId);
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("error", e.getMessage());
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    public static String uninstall(Context context, String id, boolean isPlugin) {
        JSONObject out = new JSONObject();
        try {
            String safeId = sanitizeId(id);
            if (safeId.isEmpty()) {
                out.put("ok", false);
                out.put("error", "Invalid item id");
                return out.toString();
            }
            File parent = isPlugin ? getPluginsDir(context) : getSkillsDir(context);
            File target = new File(parent, safeId);
            if (!PathSafety.isInside(parent, target) || target.equals(parent)) {
                out.put("ok", false);
                out.put("error", "Invalid target path");
                return out.toString();
            }
            deleteRecursive(target);
            out.put("ok", true);
            out.put("id", safeId);
        } catch (Exception e) {
            try {
                out.put("ok", false);
                out.put("error", e.getMessage());
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    private static void emitSafe(EventEmitter emitter, String jobId, String id, boolean isPlugin,
                                 String status, String message, boolean done, boolean ok) {
        if (emitter != null) {
            emitter.emit(jobId, id, isPlugin, status, message, done, ok);
        }
    }

    private static void installPlugin(Context context, String jobId, String safeId, String name,
                                      String description, String repoUrl, EventEmitter emitter) throws IOException {
        File pluginsDir = getPluginsDir(context);
        if (!pluginsDir.isDirectory() && !pluginsDir.mkdirs()) {
            throw new IOException("Cannot create plugins directory");
        }
        File targetDir = new File(pluginsDir, safeId);
        if (!PathSafety.isInside(pluginsDir, targetDir)) {
            throw new IOException("Unsafe plugin target path");
        }

        if ("rtk".equalsIgnoreCase(safeId)) {
            installRtkPlugin(context, jobId, safeId, name, description, targetDir, repoUrl, emitter);
            return;
        }

        if (TextUtils.isEmpty(repoUrl)) {
            if (!targetDir.isDirectory() && !targetDir.mkdirs()) {
                throw new IOException("Cannot create plugin directory");
            }
            ensurePluginManifestAndRules(targetDir, safeId, name, description, null);
            return;
        }

        File workDir = createTempWorkDir(context, "cat_plugin_");
        try {
            File zipFile = new File(workDir, "repo.zip");
            File extractDir = new File(workDir, "extracted");
            String archiveUrl = resolveGitHubArchiveUrl(repoUrl);
            emitSafe(emitter, jobId, safeId, true, "downloading",
                    "Downloading " + name + " archive...", false, true);
            downloadToFile(archiveUrl, zipFile);

            emitSafe(emitter, jobId, safeId, true, "extracting",
                    "Unpacking plugin files & skills...", false, true);
            unzipSafely(zipFile, extractDir);
            File repoRoot = findSingleRootDir(extractDir);

            deleteRecursive(targetDir);
            copyDirectory(repoRoot, targetDir);
            ensurePluginManifestAndRules(targetDir, safeId, name, description, repoRoot);
            unpackContainerSkills(repoRoot, new File(targetDir, "skills"), false);
            makeScriptsExecutable(targetDir);
        } finally {
            deleteRecursive(workDir);
        }
    }

    private static void installRtkPlugin(Context context, String jobId, String safeId, String name,
                                         String description, File targetDir, String repoUrl,
                                         EventEmitter emitter) throws IOException {
        File filesDir = context.getFilesDir();
        File usrBin = new File(filesDir, "usr/bin");
        File runtimeBin = new File(filesDir, "runtime/bin");
        File usrRtk = new File(usrBin, "rtk");
        File runtimeRtk = new File(runtimeBin, "rtk");
        File activeRtk = usrRtk.isFile() ? usrRtk : (runtimeRtk.isFile() ? runtimeRtk : null);

        if (activeRtk == null) {
            File workDir = createTempWorkDir(context, "cat_rtk_");
            try {
                File tarFile = new File(workDir, "rtk.tar.gz");
                File extractDir = new File(workDir, "extract");
                emitSafe(emitter, jobId, safeId, true, "downloading",
                        "Downloading RTK ARM64 binary...", false, true);
                downloadToFile(RTK_RELEASE_TAR_GZ, tarFile);

                emitSafe(emitter, jobId, safeId, true, "extracting",
                        "Extracting RTK runtime binary...", false, true);
                try (InputStream fis = new FileInputStream(tarFile)) {
                    TarExtractor.untarGz(fis, extractDir);
                }
                File foundBin = findFileNamed(extractDir, "rtk");
                if (foundBin == null || !foundBin.isFile()) {
                    throw new IOException("RTK binary not found inside release archive");
                }
                if (!usrBin.isDirectory() && !usrBin.mkdirs()) {
                    throw new IOException("Cannot create usr/bin directory");
                }
                copyFile(foundBin, usrRtk);
                FileModeUtil.setExec(usrRtk);
                activeRtk = usrRtk;
            } finally {
                deleteRecursive(workDir);
            }
        } else {
            FileModeUtil.setExec(activeRtk);
        }

        if (!targetDir.isDirectory() && !targetDir.mkdirs()) {
            throw new IOException("Cannot create RTK plugin directory");
        }
        File rulesDir = new File(targetDir, "rules");
        if (!rulesDir.isDirectory()) {
            rulesDir.mkdirs();
        }
        writePluginJson(targetDir, safeId, TextUtils.isEmpty(name) ? "RTK" : name,
                TextUtils.isEmpty(description) ? "Runtime Tool Kit" : description);
        AtomicFileWriter.writeText(new File(rulesDir, "AGENTS.md"), RTK_RULES_AGENTS_MD);

        // Best-effort: fetch repo skills if present and run rtk init
        if (!TextUtils.isEmpty(repoUrl)) {
            File repoWork = createTempWorkDir(context, "cat_rtk_repo_");
            try {
                File zipFile = new File(repoWork, "repo.zip");
                File extractDir = new File(repoWork, "extract");
                downloadToFile(resolveGitHubArchiveUrl(repoUrl), zipFile);
                unzipSafely(zipFile, extractDir);
                File repoRoot = findSingleRootDir(extractDir);
                unpackContainerSkills(repoRoot, new File(targetDir, "skills"), false);
            } catch (Exception e) {
                Log.w(TAG, "Optional RTK skills archive fetch skipped: " + e.getMessage());
            } finally {
                deleteRecursive(repoWork);
            }
        }

        runRtkInitBestEffort(filesDir, activeRtk);
    }

    private static void runRtkInitBestEffort(File filesDir, File rtkBin) {
        if (rtkBin == null || !rtkBin.canExecute()) {
            return;
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    rtkBin.getAbsolutePath(), "init", "--agent", "antigravity", "--global", "--auto-patch");
            pb.directory(filesDir);
            pb.redirectErrorStream(true);
            pb.environment().put("HOME", filesDir.getAbsolutePath());
            pb.environment().put("PATH", filesDir.getAbsolutePath() + "/usr/bin:"
                    + filesDir.getAbsolutePath() + "/runtime/bin:/system/bin");
            Process p = pb.start();
            if (!p.waitFor(10, TimeUnit.SECONDS)) {
                p.destroyForcibly();
            }
        } catch (Exception e) {
            Log.w(TAG, "rtk init skipped: " + e.getMessage());
        }
    }

    private static void installSkill(Context context, String jobId, String safeId, String name,
                                     String description, String repoUrl, String subPath,
                                     EventEmitter emitter) throws IOException {
        File skillsDir = getSkillsDir(context);
        if (!skillsDir.isDirectory() && !skillsDir.mkdirs()) {
            throw new IOException("Cannot create skills directory");
        }
        File targetDir = new File(skillsDir, safeId);
        if (!PathSafety.isInside(skillsDir, targetDir)) {
            throw new IOException("Unsafe skill target path");
        }

        if (TextUtils.isEmpty(repoUrl)) {
            emitSafe(emitter, jobId, safeId, false, "extracting",
                    "Deploying built-in skill assets...", false, true);
            File builtinSrc = findBuiltinSkillDir(context, safeId);
            deleteRecursive(targetDir);
            if (builtinSrc != null && builtinSrc.isDirectory()) {
                copyDirectory(builtinSrc, targetDir);
            } else {
                targetDir.mkdirs();
            }
            ensureSkillMd(targetDir, safeId, name, description);
            makeScriptsExecutable(targetDir);
            return;
        }

        File workDir = createTempWorkDir(context, "cat_skill_");
        try {
            File zipFile = new File(workDir, "repo.zip");
            File extractDir = new File(workDir, "extracted");
            String archiveUrl = resolveGitHubArchiveUrl(repoUrl);
            emitSafe(emitter, jobId, safeId, false, "downloading",
                    "Downloading " + name + " from GitHub...", false, true);
            downloadToFile(archiveUrl, zipFile);

            emitSafe(emitter, jobId, safeId, false, "extracting",
                    "Extracting skill files...", false, true);
            unzipSafely(zipFile, extractDir);
            File repoRoot = findSingleRootDir(extractDir);

            deleteRecursive(targetDir);
            if (!TextUtils.isEmpty(subPath)) {
                String cleanSub = subPath.replace('\\', '/').replaceAll("^/+|/+$", "");
                if (cleanSub.contains("..") || cleanSub.indexOf('\0') >= 0) {
                    throw new IOException("Unsafe subPath: " + subPath);
                }
                File subDir = new File(repoRoot, cleanSub);
                if (!PathSafety.isInside(repoRoot, subDir) || !subDir.isDirectory()) {
                    throw new IOException("Skill subPath not found in repository: " + cleanSub);
                }
                copyDirectory(subDir, targetDir);
            } else {
                copyDirectory(repoRoot, targetDir);
                // Also unpack individual child skills in vault repos so language_server discovers them directly
                unpackContainerSkills(repoRoot, skillsDir, true);
            }
            ensureSkillMd(targetDir, safeId, name, description);
            makeScriptsExecutable(targetDir);
        } finally {
            deleteRecursive(workDir);
        }
    }

    private static File findBuiltinSkillDir(Context context, String safeId) {
        File builtinRoot = getBuiltinSkillsDir(context);
        if (!builtinRoot.isDirectory()) {
            return null;
        }
        List<String> candidates = Arrays.asList(
                safeId,
                safeId.replace('-', '_'),
                safeId.replace('_', '-')
        );
        for (String cand : candidates) {
            File f = new File(builtinRoot, cand);
            if (f.isDirectory()) {
                return f;
            }
        }
        return null;
    }

    private static void ensureSkillMd(File skillDir, String safeId, String name, String description) {
        if (!skillDir.isDirectory()) {
            skillDir.mkdirs();
        }
        File skillMd = new File(skillDir, "SKILL.md");
        if (skillMd.isFile()) {
            return;
        }
        String cleanDesc = (description != null ? description : safeId).replace('\n', ' ').trim();
        String title = !TextUtils.isEmpty(name) ? name : safeId;
        String content = "---\nname: " + safeId + "\ndescription: " + cleanDesc
                + "\n---\n\n# " + title + "\n\n" + cleanDesc + "\n";
        AtomicFileWriter.writeText(skillMd, content);
    }

    private static void ensurePluginManifestAndRules(File targetDir, String safeId, String name,
                                                     String description, File repoRoot) throws IOException {
        File rootManifest = new File(targetDir, "plugin.json");
        if (!rootManifest.isFile()) {
            File altAg = new File(targetDir, ".antigravity-plugin/plugin.json");
            File altClaude = new File(targetDir, ".claude-plugin/plugin.json");
            if (altAg.isFile()) {
                copyFile(altAg, rootManifest);
            } else if (altClaude.isFile()) {
                copyFile(altClaude, rootManifest);
            } else {
                writePluginJson(targetDir, safeId, name, description);
            }
        }

        File rulesDir = new File(targetDir, "rules");
        if (!rulesDir.isDirectory()) {
            rulesDir.mkdirs();
        }
        File agentsMd = new File(rulesDir, "AGENTS.md");
        if (!agentsMd.isFile()) {
            File srcRule = null;
            File antislopMd = new File(rulesDir, "antislop.md");
            if (antislopMd.isFile()) {
                srcRule = antislopMd;
            }
            if (srcRule == null) {
                File[] ruleFiles = rulesDir.listFiles();
                if (ruleFiles != null) {
                    Arrays.sort(ruleFiles);
                    for (File rf : ruleFiles) {
                        if (rf.isFile() && rf.getName().toLowerCase().endsWith(".md")) {
                            srcRule = rf;
                            break;
                        }
                    }
                }
            }
            if (srcRule == null) {
                File searchBase = repoRoot != null ? repoRoot : targetDir;
                for (String cand : Arrays.asList("AGENTS.md", "GEMINI.md", "CLAUDE.md", "README.md")) {
                    File f = new File(searchBase, cand);
                    if (f.isFile()) {
                        srcRule = f;
                        break;
                    }
                }
            }
            if (srcRule != null) {
                copyFile(srcRule, agentsMd);
            } else {
                String title = !TextUtils.isEmpty(name) ? name : safeId;
                String desc = !TextUtils.isEmpty(description) ? description : title;
                AtomicFileWriter.writeText(agentsMd, "# " + title + "\n\n" + desc + "\n");
            }
        }
    }

    private static void writePluginJson(File pluginDir, String safeId, String name, String description) {
        try {
            JSONObject meta = new JSONObject();
            meta.put("uid", safeId);
            meta.put("name", !TextUtils.isEmpty(name) ? name : safeId);
            meta.put("version", "1.0.0");
            meta.put("description", description != null ? description : "");
            AtomicFileWriter.writeText(new File(pluginDir, "plugin.json"), meta.toString(2) + "\n");
        } catch (Exception e) {
            Log.w(TAG, "writePluginJson fallback error: " + e.getMessage());
        }
    }

    private static void unpackContainerSkills(File repoRoot, File destSkillsDir, boolean requireSkillMd)
            throws IOException {
        if (repoRoot == null || !repoRoot.isDirectory()) {
            return;
        }
        String[] containers = {"skills", ".gemini/skills", "plugin/skills", ".agents/skills"};
        for (String rel : containers) {
            File sdir = new File(repoRoot, rel);
            if (!sdir.isDirectory()) {
                continue;
            }
            File[] children = sdir.listFiles();
            if (children == null) {
                continue;
            }
            for (File child : children) {
                if (!child.isDirectory()) {
                    continue;
                }
                String cname = sanitizeId(child.getName());
                if (cname.isEmpty()) {
                    continue;
                }
                if (requireSkillMd && !new File(child, "SKILL.md").isFile()) {
                    continue;
                }
                if (!destSkillsDir.isDirectory()) {
                    destSkillsDir.mkdirs();
                }
                File outChild = new File(destSkillsDir, cname);
                if (!PathSafety.isInside(destSkillsDir, outChild)) {
                    continue;
                }
                if (!outChild.getCanonicalPath().equals(child.getCanonicalPath())) {
                    deleteRecursive(outChild);
                    copyDirectory(child, outChild);
                    makeScriptsExecutable(outChild);
                }
            }
        }
    }

    private static void makeScriptsExecutable(File root) {
        File scripts = new File(root, "scripts");
        if (scripts.isDirectory()) {
            FileModeUtil.recursiveSetExec(scripts);
        }
    }

    public static String resolveGitHubArchiveUrl(String repoUrl) throws IOException {
        String u = repoUrl.trim();
        if (u.endsWith(".zip")) {
            return u;
        }
        if (u.startsWith("git@github.com:")) {
            u = "https://github.com/" + u.substring("git@github.com:".length());
        } else if (u.startsWith("http://github.com/")) {
            u = "https://github.com/" + u.substring("http://github.com/".length());
        }
        if (u.endsWith(".git")) {
            u = u.substring(0, u.length() - 4);
        }
        while (u.endsWith("/")) {
            u = u.substring(0, u.length() - 1);
        }
        if (!u.startsWith("https://github.com/")) {
            throw new IOException("Unsupported repository URL (expected GitHub HTTPS URL): " + repoUrl);
        }
        String path = u.substring("https://github.com/".length());
        String[] parts = path.split("/");
        if (parts.length < 2 || parts[0].isEmpty() || parts[1].isEmpty()) {
            throw new IOException("Invalid GitHub repository path: " + repoUrl);
        }
        return "https://github.com/" + parts[0] + "/" + parts[1] + "/archive/HEAD.zip";
    }

    private static void downloadToFile(String urlStr, File destFile) throws IOException {
        String currentUrl = urlStr;
        for (int redirect = 0; redirect < 6; redirect++) {
            HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Antigravity-Android");
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (TextUtils.isEmpty(loc)) {
                    throw new IOException("Redirect without Location header from " + currentUrl);
                }
                currentUrl = new URL(new URL(currentUrl), loc).toString();
                continue;
            }
            if (code < 200 || code >= 300) {
                conn.disconnect();
                throw new IOException("HTTP " + code + " downloading " + currentUrl);
            }
            try (InputStream in = new BufferedInputStream(conn.getInputStream(), 65536);
                 OutputStream out = new BufferedOutputStream(new FileOutputStream(destFile), 65536)) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
            } finally {
                conn.disconnect();
            }
            return;
        }
        throw new IOException("Too many HTTP redirects downloading " + urlStr);
    }

    private static void unzipSafely(File zipFile, File destDir) throws IOException {
        if (!destDir.isDirectory() && !destDir.mkdirs()) {
            throw new IOException("Cannot create extract directory: " + destDir);
        }
        byte[] buf = new byte[32768];
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zipFile), 65536))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                if (TextUtils.isEmpty(name)) {
                    zis.closeEntry();
                    continue;
                }
                File out = new File(destDir, name);
                if (!PathSafety.isInside(destDir, out)) {
                    throw new IOException("Blocked unsafe zip entry: " + name);
                }
                if (entry.isDirectory()) {
                    if (!out.isDirectory() && !out.mkdirs()) {
                        throw new IOException("Cannot create directory: " + out);
                    }
                } else {
                    File parent = out.getParentFile();
                    if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("Cannot create parent directory: " + parent);
                    }
                    try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out), 32768)) {
                        int n;
                        while ((n = zis.read(buf)) != -1) {
                            os.write(buf, 0, n);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private static File findSingleRootDir(File extractDir) {
        File[] children = extractDir.listFiles();
        if (children != null) {
            List<File> dirs = new ArrayList<>();
            for (File c : children) {
                if (c.isDirectory() && !c.getName().startsWith("__MACOSX")) {
                    dirs.add(c);
                }
            }
            if (dirs.size() == 1 && (children.length == 1 || dirs.size() == children.length)) {
                return dirs.get(0);
            }
        }
        return extractDir;
    }

    private static File findFileNamed(File dir, String targetName) {
        File[] children = dir.listFiles();
        if (children == null) {
            return null;
        }
        for (File c : children) {
            if (c.isFile() && targetName.equals(c.getName())) {
                return c;
            }
            if (c.isDirectory()) {
                File found = findFileNamed(c, targetName);
                if (found != null) {
                    return found;
                }
            }
        }
        return null;
    }

    private static File createTempWorkDir(Context context, String prefix) throws IOException {
        File base = new File(context.getCacheDir(), "catalogue_tmp");
        if (!base.isDirectory() && !base.mkdirs()) {
            throw new IOException("Cannot create cache work directory");
        }
        File dir = new File(base, prefix + UUID.randomUUID().toString());
        if (!dir.mkdirs()) {
            throw new IOException("Cannot create temp dir: " + dir);
        }
        return dir;
    }

    private static void copyDirectory(File src, File dst) throws IOException {
        if (!src.isDirectory()) {
            return;
        }
        if (!dst.isDirectory() && !dst.mkdirs()) {
            throw new IOException("Cannot create directory: " + dst);
        }
        File[] children = src.listFiles();
        if (children == null) {
            return;
        }
        for (File c : children) {
            String name = c.getName();
            if (".git".equals(name)) {
                continue;
            }
            File destChild = new File(dst, name);
            if (c.isDirectory()) {
                copyDirectory(c, destChild);
            } else if (c.isFile()) {
                copyFile(c, destChild);
            }
        }
    }

    private static void copyFile(File src, File dst) throws IOException {
        File parent = dst.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Cannot create parent dir for " + dst);
        }
        byte[] buf = new byte[32768];
        try (InputStream in = new FileInputStream(src);
             OutputStream out = new FileOutputStream(dst)) {
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
        }
    }

    private static void deleteRecursive(File f) {
        if (f == null || !f.exists()) {
            return;
        }
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) {
                deleteRecursive(c);
            }
        }
        f.delete();
    }
}
