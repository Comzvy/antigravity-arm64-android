#!/usr/bin/env bash
#
# web/build.sh - concatenate web/src/** fragments into web/generated/**.
#
# Reads web/src.manifest. Each `bundle [iife] <out>` opens a bundle; the
# following `src/...` lines are concatenated in order into web/generated/<out>.
# IIFE bundles are wrapped as:
#     (function(){
#     <fragments>
#     })();
# Non-iife bundles are copied verbatim (fragments share plain scope). Blank
# lines are ignored; `#` and `;` start a comment. Idempotent: generated/ is
# rebuilt from scratch, then every file is `node --check`ed when node exists.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/src.manifest"
GEN_DIR="$SCRIPT_DIR/generated"

die() { printf 'build.sh: %s\n' "$*" >&2; exit 1; }

[ -f "$MANIFEST" ] || die "manifest not found: $MANIFEST"

rm -rf "$GEN_DIR"
mkdir -p "$GEN_DIR"

if [ -n "${TMPDIR:-}" ] && [ -d "$TMPDIR" ] && [ -w "$TMPDIR" ]; then
    TMP_DIR="$TMPDIR"
elif [ -n "${HOME:-}" ] && [ -d "$HOME" ] && [ -w "$HOME" ]; then
    TMP_DIR="$HOME/.tmp"
else
    TMP_DIR="/tmp"
fi
mkdir -p "$TMP_DIR" 2>/dev/null || TMP_DIR="."
bundle_tmp="$(mktemp "$TMP_DIR/agy-web-bundle.XXXXXX")"
trap 'rm -f "$bundle_tmp"' EXIT

current_out=""
current_iife=0
have_bundle=0

bundle_names=()
bundle_sizes=()
src_count=0

is_already_iife() {
    local file="$1"
    awk '
    BEGIN { first=""; last=""; in_block=0 }
    {
        line = $0
        if (in_block) {
            if (line ~ /\*\//) {
                sub(/^.*\*\//, "", line)
                in_block = 0
            } else {
                next
            }
        }
        while (line ~ /\/\*.*\*\//) {
            sub(/\/\*.*?\*\//, "", line)
        }
        if (line ~ /\/\*/) {
            sub(/\/\*.*$/, "", line)
            in_block = 1
        }
        sub(/^[ \t]+/, "", line)
        sub(/[ \t]+$/, "", line)
        if (line == "" || line ~ /^\/\//) next
        if (first == "") first = line
        last = line
    }
    END {
        if ((first ~ /^\(function/ || first ~ /^!function/ || first ~ /^\(\(\)/) && (last ~ /\)\(\);?$/ || last ~ /}\)\(\);?$/)) {
            exit 0
        }
        exit 1
    }' "$file"
}

emit_bundle() {
    [ "$have_bundle" -eq 1 ] || return 0
    local dest="$GEN_DIR/$current_out"
    mkdir -p "$(dirname "$dest")"
    if [ "$current_iife" -eq 1 ]; then
        if is_already_iife "$bundle_tmp"; then
            cat "$bundle_tmp" > "$dest"
        else
            {
                printf '(function(){\n'
                cat "$bundle_tmp"
                printf '\n})();\n'
            } > "$dest"
        fi
    else
        cat "$bundle_tmp" > "$dest"
    fi
    local size
    size=$(wc -c < "$dest" | tr -d ' ')
    bundle_names+=("$current_out")
    bundle_sizes+=("$size")
    : > "$bundle_tmp"
    current_out=""
    current_iife=0
    have_bundle=0
}

while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    # trim leading then trailing whitespace
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    [ -z "$line" ] && continue
    case "$line" in
        '#'*|';'*) continue ;;
    esac

    case "$line" in
        bundle\ *|bundle)
            emit_bundle
            read -r _ a b <<< "$line"
            if [ "${a:-}" = "iife" ]; then
                current_out="${b:-}"
                current_iife=1
            else
                current_out="${a:-}"
                current_iife=0
            fi
            [ -n "$current_out" ] || die "bundle line missing output: $line"
            have_bundle=1
            ;;
        src/*)
            [ "$have_bundle" -eq 1 ] || die "src line before any bundle: $line"
            src_path="$SCRIPT_DIR/$line"
            [ -f "$src_path" ] || die "missing source: $line"
            cat "$src_path" >> "$bundle_tmp"
            printf '\n' >> "$bundle_tmp"
            src_count=$((src_count + 1))
            ;;
        *)
            die "unrecognized manifest line: $line"
            ;;
    esac
done < "$MANIFEST"

emit_bundle

[ "${#bundle_names[@]}" -gt 0 ] || die "no bundles emitted"

# Patch only a staged copy: never dirty the checked-in upstream main.js.
[ -f "$SCRIPT_DIR/main.js" ] || die "main.js not found"
[ -f "$SCRIPT_DIR/patch_main.py" ] || die "patch_main.py not found"
cp -f "$SCRIPT_DIR/main.js" "$GEN_DIR/main.js"

PYTHON_BIN=""
for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "import sys" >/dev/null 2>&1; then
        PYTHON_BIN="$cand"
        break
    fi
done

if [ -n "$PYTHON_BIN" ]; then
    "$PYTHON_BIN" "$SCRIPT_DIR/patch_main.py" "$GEN_DIR/main.js" \
        || die "web/patch_main.py failed"
elif command -v node >/dev/null 2>&1; then
    node - "$GEN_DIR/main.js" <<'NODE_PATCH' || die "node patch_main fallback failed"
const fs = require("fs");
const filePath = process.argv[2];
let content = fs.readFileSync(filePath, "utf8");

// 1. patch_appearance
if (!content.includes("Desktop Mode") && !content.includes("ag_desktop_mode")) {
  const tIdx = content.indexOf('{label:"Theme"');
  let hm = null, tm = null, reactId = "D", winStart = 0;
  if (tIdx !== -1) {
    winStart = Math.max(0, tIdx - 600);
    const win = content.slice(winStart, Math.min(content.length, tIdx + 500));
    const hookReV233 = /([A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3;var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2;)(?=return\s+[A-Za-z0-9_$]+\.createElement\([^,]+,null,[A-Za-z0-9_$]+\.createElement\([^,]+,\{title:"Appearance"\})/;
    const hookReV211 = /(var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+=>\s*[A-Za-z0-9_$]+=>\{[^}]{0,400}\};)/;
    hm = hookReV233.exec(win) || hookReV211.exec(win);
    tm = /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:"Theme",.*?onSelect:[A-Za-z0-9_$]+\}\)/.exec(win);
    if (tm) reactId = tm[1];
  }
  if (!hm || !tm) throw new Error("appearance patterns not matched");
  const origHook = hm[1];
  const injHook =
    `var [isDesktop,setIsDesktop]=(0,${reactId}.useState)(()=>{try{if(window.Android&&typeof window.Android.isDesktopMode==='function')return window.Android.isDesktopMode();var s=localStorage.getItem('ag_desktop_mode');return s===null?!1:s==='true'}catch(_){return !1}});` +
    `var onDesktopToggle=(0,${reactId}.useCallback)(v=>{setIsDesktop(v);try{localStorage.setItem('ag_desktop_mode',String(v));if(window.Android&&typeof window.Android.setDesktopMode==='function')window.Android.setDesktopMode(v)}catch(_){}},[]);` +
    origHook;
  let itemComp = "bT", switchComp = "eT";
  const reIt = content.matchAll(/rightElement:/g);
  for (const m of reIt) {
    const rw = content.slice(Math.max(0, m.index - 180), Math.min(content.length, m.index + 180));
    const sw = /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:[^}]+,rightElement:[A-Za-z0-9_$]+\.createElement\(([A-Za-z0-9_$]+),\{checked:/.exec(rw);
    if (sw) { itemComp = sw[2]; switchComp = sw[3]; break; }
  }
  const origTheme = tm[0];
  const injTheme = origTheme +
    `,${reactId}.createElement(${itemComp},{label:"Desktop Mode",description:"Use desktop viewport and user agent for the workspace",rightElement:${reactId}.createElement(${switchComp},{checked:isDesktop,onCheckedChange:onDesktopToggle})})` +
    `,${reactId}.createElement(${itemComp},{label:"AI Models & API Keys",description:"Use Gemini, OpenAI, Claude, OpenRouter, DeepSeek, Groq, or Custom API Keys",rightElement:${reactId}.createElement("button",{type:"button",onClick:()=>{if(window.__agOpenAiModelsModal)window.__agOpenAiModelsModal()},className:"px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"},"Manage Keys")})`;
  const hookAbsStart = winStart + hm.index;
  const hookAbsEnd = hookAbsStart + origHook.length;
  content = (content.slice(0, hookAbsStart) + injHook + content.slice(hookAbsEnd)).replace(origTheme, injTheme);
}

// 2. patch_voice_input
if (!content.includes("__agVoiceBridge")) {
  content = content.replace(
    /c\|\|\(c=([A-Za-z0-9_$]+)\(a\.stateProvider,([A-Za-z0-9_$]+)=>\(\2=\2\[b\]\)\?!\2\.disabled:!1\),a\.experimentEnabledProviders\.set\(b,c\)\)/,
    (_, fnId, argId) => `c||(c=${fnId}(a.stateProvider,${argId}=>b==="enable-audio-transcription"?!0:(${argId}=${argId}[b])?!${argId}.disabled:!1),a.experimentEnabledProviders.set(b,c))`
  );
  content = content.replace(
    'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h)}else b(!1)',
    'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h||!!window.__agVoiceBridge?.hasMicrophone?.())}else b(!!window.__agVoiceBridge?.hasMicrophone?.())'
  );
  content = content.replace(
    /streamAudioTranscription:\(\.\.\.([A-Za-z0-9_$]+)\)=>\s*f\(([A-Za-z0-9_$]+)=>\2\.streamAudioTranscription\(\.\.\.\1\)\),sendAudioChunk:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\4\.sendAudioChunk\(\3\)\),endAudioSession:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\6\.endAudioSession\(\5\)\),/,
    (_, u1, v1, u2, v2, u3, v3) =>
      `streamAudioTranscription:(...${u1})=>window.__agVoiceBridge?window.__agVoiceBridge.streamAudioTranscription(${u1}[0],${u1}[1],()=>f(${v1}=>${v1}.streamAudioTranscription(...${u1}))):f(${v1}=>${v1}.streamAudioTranscription(...${u1})),` +
      `sendAudioChunk:async ${u2}=>window.__agVoiceBridge?window.__agVoiceBridge.sendAudioChunk(${u2},()=>f(async ${v2}=>${v2}.sendAudioChunk(${u2}))):f(async ${v2}=>${v2}.sendAudioChunk(${u2})),` +
      `endAudioSession:async ${u3}=>window.__agVoiceBridge?window.__agVoiceBridge.endAudioSession(${u3},()=>f(async ${v3}=>${v3}.endAudioSession(${u3}))):f(async ${v3}=>${v3}.endAudioSession(${u3})),`
  );
  content = content.replace(
    /(async function [A-Za-z0-9_$]+\(a,b\)\{)(var c=e,d=e;try\{let f=typeof b==="string"\|\|b===void 0\?\{deviceId:b,autoGainControl:!1\}:b)/,
    '$1if(b&&typeof b==="object"&&b.createAudioContext&&window.__agVoiceBridge?.shouldUseNativeMic?.())return{ctx:null,stream:null,sampleRate:16E3,setDevice:()=>Promise.resolve(),reconnect:()=>Promise.resolve(),stop:()=>Promise.resolve()};$2'
  );
}

// 3. patch_onboarding_layout
content = content.replaceAll(
  'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-[480px] max-w-full max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"',
  'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-full max-w-[440px] box-border max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"'
);
content = content.replaceAll(
  'className:"w-[480px] max-w-full min-h-0 max-h-full flex flex-col overflow-hidden p-6"',
  'className:"w-full max-w-[440px] box-border min-h-0 max-h-full flex flex-col overflow-hidden p-6"'
);
content = content.replaceAll(
  'className:"w-[480px] max-w-full p-6"',
  'className:"w-full max-w-[440px] box-border p-6"'
);
content = content.replaceAll(
  'enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
  'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'
);
content = content.replaceAll(
  'enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.AUTO',
  'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'
);
content = content.replaceAll(
  'default:return{sandboxMode:!0,autoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
  'default:return{sandboxMode:!1,autoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'
);

// 4. patch_mcp_plugins_fallback
if (!content.includes("__agMcpPluginsFallback")) {
  content = content.replace(
    /getAvailableCascadePlugins:async\s+([A-Za-z0-9_$]+)=>f\(([A-Za-z0-9_$]+)=>\2\.getAvailableCascadePlugins\(([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),\1\)\)\),\s*getBuildWithGooglePlugins:async\(\)=>f\(([A-Za-z0-9_$]+)=>\5\.getBuildWithGooglePlugins\(\3\(([A-Za-z0-9_$]+),\{\}\)\)\),\s*downloadBuildWithGooglePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\9\.pluginId=\7\.uid;return\s+\8\.downloadBuildWithGooglePlugin\(\9\)\}\),\s*deletePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\s*\13\.pluginId=\11\.pluginId;return\s+\12\.deletePlugin\(\13\)\}\)/,
    (_, u1, v1, cfn, tAvail, u2, tBwg, u3, v3, w3, tDl, u4, v4, w4, tDel) =>
      `getAvailableCascadePlugins:async ${u1}=>{try{var r=await f(${v1}=>${v1}.getAvailableCascadePlugins(${cfn}(${tAvail},${u1})));if(r&&r.plugins&&r.plugins.length>0)return r}catch(_){}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getAvailableCascadePlugins(${u1}):{plugins:[]}},` +
      `getBuildWithGooglePlugins:async()=>{try{var r=await f(${u2}=>${u2}.getBuildWithGooglePlugins(${cfn}(${tBwg},{})));if(r&&r.plugins&&r.plugins.length>0)return r}catch(_){}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getBuildWithGooglePlugins():{plugins:[]}},` +
      `downloadBuildWithGooglePlugin:async ${u3}=>{try{return await f(async ${v3}=>{var ${w3}=${cfn}(${tDl});${w3}.pluginId=${u3}.uid;return ${v3}.downloadBuildWithGooglePlugin(${w3})})}catch(e){if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.installPluginLocally(${u3}.uid);throw e}},` +
      `deletePlugin:async ${u4}=>{try{return await f(async ${v4}=>{var ${w4}=${cfn}(${tDel});${w4}.pluginId=${u4}.pluginId;return ${v4}.deletePlugin(${w4})})}catch(e){if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.removePluginLocally(${u4}.pluginId);throw e}}`
  );
}

if (!content.includes("Desktop Mode") || !content.includes("__agVoiceBridge") || !content.includes("__agMcpPluginsFallback")) {
  throw new Error("Verification failed: missing expected markers in patched main.js");
}
fs.writeFileSync(filePath, content, "utf8");
console.log("[web-patch] Successfully patched main.js via node fallback");
NODE_PATCH
else
    die "neither python3 nor node found to patch main.js"
fi

printf 'web: generated %d bundle(s) from %d fragment(s)\n' \
    "${#bundle_names[@]}" "$src_count"
i=0
while [ "$i" -lt "${#bundle_names[@]}" ]; do
    printf '  %-42s %8s bytes\n' "${bundle_names[$i]}" "${bundle_sizes[$i]}"
    i=$((i + 1))
done

if command -v node >/dev/null 2>&1; then
    printf 'node --check:\n'
    i=0
    while [ "$i" -lt "${#bundle_names[@]}" ]; do
        dest="$GEN_DIR/${bundle_names[$i]}"
        if node --check "$dest"; then
            printf '  ok   %s\n' "${bundle_names[$i]}"
        else
            die "node --check failed: ${bundle_names[$i]}"
        fi
        i=$((i + 1))
    done
    node --check "$GEN_DIR/main.js" || die "node --check failed: generated/main.js"
else
    printf 'node not found; skipped node --check\n'
fi

exit 0
