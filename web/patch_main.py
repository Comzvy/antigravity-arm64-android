#!/usr/bin/env python3
"""
web/patch_main.py - Dynamic patcher for web/main.js (supports v2.33.0 and v2.11.0).

Locates the Appearance settings block and injects the Desktop Mode toggle,
AI Models & API Keys button, Android Voice-to-Text (__agVoiceBridge) hooks,
responsive onboarding/login layout, and MCP/Plugins fallback if not already present.
"""

import sys
import os
import re


def patch_appearance(content):
    if '"Kelola API Key"' in content:
        content = content.replace('"Kelola API Key"', '"Manage Keys"')
        print("[web-patch] Updated AI Models button label to English in main.js")
        return content, True
    if "Desktop Mode" in content or "ag_desktop_mode" in content:
        print("[web-patch] Desktop Mode & AI Models toggle already present in main.js")
        return content, False

    # v2.11.0 hook pattern or v2.33.0 pre-return hook point inside AppearanceSettings
    hook_pattern_v211 = re.compile(
        r'(var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+=>\s*[A-Za-z0-9_$]+=>\{.*?\};)'
    )
    hook_pattern_v233 = re.compile(
        r'([A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3;var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2;)(?=return\s+[A-Za-z0-9_$]+\.createElement\([^,]+,null,[A-Za-z0-9_$]+\.createElement\([^,]+,\{title:"Appearance"\})'
    )
    hook_match = hook_pattern_v211.search(content) or hook_pattern_v233.search(content)

    theme_idx = content.find('{label:"Theme"')
    theme_match = None
    react_id = "D"
    if theme_idx != -1:
        window_start = max(0, theme_idx - 100)
        window_end = min(len(content), theme_idx + 500)
        window_text = content[window_start:window_end]
        theme_pattern = re.compile(
            r'([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:"Theme",.*?onSelect:[A-Za-z0-9_$]+\}\)'
        )
        theme_match = theme_pattern.search(window_text)
        if theme_match:
            react_id = theme_match.group(1)

    if not hook_match or not theme_match:
        print(f"[web-patch] appearance patterns not matched: hook={bool(hook_match)}, theme={bool(theme_match)}", file=sys.stderr)
        return content, False

    orig_hook = hook_match.group(1)
    injected_hook = (
        f"var [isDesktop,setIsDesktop]=(0,{react_id}.useState)(()=>{{"
        "try{if(window.Android&&typeof window.Android.isDesktopMode==='function')return window.Android.isDesktopMode();"
        "var s=localStorage.getItem('ag_desktop_mode');return s===null?!1:s==='true'}catch(_){return !1}});"
        f"var onDesktopToggle=(0,{react_id}.useCallback)(v=>{{"
        "setIsDesktop(v);try{localStorage.setItem('ag_desktop_mode',String(v));"
        "if(window.Android&&typeof window.Android.setDesktopMode==='function')window.Android.setDesktopMode(v)}catch(_){}},[]);"
        + orig_hook
    )

    item_comp = "bT"
    switch_comp = "eT"
    re_idx = content.find('rightElement:')
    if re_idx != -1:
        for m in re.finditer(r'rightElement:', content):
            re_window = content[max(0, m.start() - 180):min(len(content), m.start() + 180)]
            sw_pair = re.search(
                r'([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:[^}]+,rightElement:[A-Za-z0-9_$]+\.createElement\(([A-Za-z0-9_$]+),\{checked:',
                re_window,
            )
            if sw_pair:
                item_comp = sw_pair.group(2)
                switch_comp = sw_pair.group(3)
                break

    orig_theme = theme_match.group(0)
    injected_theme = (
        orig_theme
        + f',{react_id}.createElement({item_comp},{{label:"Desktop Mode",description:"Use desktop viewport and user agent for the workspace",'
        + f'rightElement:{react_id}.createElement({switch_comp},{{checked:isDesktop,onCheckedChange:onDesktopToggle}})}})'
        + f',{react_id}.createElement({item_comp},{{label:"AI Models & API Keys",description:"Use Gemini, OpenAI, Claude, OpenRouter, DeepSeek, Groq, or Custom API Keys",'
        + f'rightElement:{react_id}.createElement("button",{{type:"button",onClick:()=>{{if(window.__agOpenAiModelsModal)window.__agOpenAiModelsModal()}},'
        + f'className:"px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"}},"Manage Keys")}})'
    )

    content = content.replace(orig_hook, injected_hook, 1)
    content = content.replace(orig_theme, injected_theme, 1)
    print(f"[web-patch] Successfully patched Desktop Mode & AI Models into main.js (react={react_id}, item={item_comp}, switch={switch_comp})")
    return content, True


def patch_voice_input(content):
    if "__agVoiceBridge" in content:
        print("[web-patch] Android Voice-to-Text (__agVoiceBridge) already present in main.js")
        return content, False

    modified = False

    # 1. Force enable-audio-transcription experiment flag to true
    exp_re = re.compile(
        r'c\|\|\(c=([A-Za-z0-9_$]+)\(a\.stateProvider,([A-Za-z0-9_$]+)=>\(\2=\2\[b\]\)\?!\2\.disabled:!1\),a\.experimentEnabledProviders\.set\(b,c\)\)'
    )
    m_exp = exp_re.search(content)
    if m_exp:
        fn_id, arg_id = m_exp.group(1), m_exp.group(2)
        repl = f'c||(c={fn_id}(a.stateProvider,{arg_id}=>b==="enable-audio-transcription"?!0:({arg_id}={arg_id}[b])?!{arg_id}.disabled:!1),a.experimentEnabledProviders.set(b,c))'
        content = content[:m_exp.start()] + repl + content[m_exp.end():]
        modified = True

    # 2. Ensure hasMicrophone returns true when Android voice bridge is available
    mic_orig = 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h)}else b(!1)'
    mic_repl = 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h||!!window.__agVoiceBridge?.hasMicrophone?.())}else b(!!window.__agVoiceBridge?.hasMicrophone?.())'
    if mic_orig in content:
        content = content.replace(mic_orig, mic_repl, 1)
        modified = True

    # 3. Route streamAudioTranscription / sendAudioChunk / endAudioSession through window.__agVoiceBridge
    rpc_re_v233 = re.compile(
        r'streamAudioTranscription:\(\.\.\.([A-Za-z0-9_$]+)\)=>\s*f\(([A-Za-z0-9_$]+)=>\2\.streamAudioTranscription\(\.\.\.\1\)\),'
        r'sendAudioChunk:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\4\.sendAudioChunk\(\3\)\),'
        r'endAudioSession:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\6\.endAudioSession\(\5\)\),'
    )
    m_rpc = rpc_re_v233.search(content)
    if m_rpc:
        u1, v1, u2, v2, u3, v3 = m_rpc.groups()
        repl = (
            f'streamAudioTranscription:(...{u1})=>window.__agVoiceBridge?window.__agVoiceBridge.streamAudioTranscription({u1}[0],{u1}[1],()=>f({v1}=>{v1}.streamAudioTranscription(...{u1}))):f({v1}=>{v1}.streamAudioTranscription(...{u1})),'
            f'sendAudioChunk:async {u2}=>window.__agVoiceBridge?window.__agVoiceBridge.sendAudioChunk({u2},()=>f(async {v2}=>{v2}.sendAudioChunk({u2}))):f(async {v2}=>{v2}.sendAudioChunk({u2})),'
            f'endAudioSession:async {u3}=>window.__agVoiceBridge?window.__agVoiceBridge.endAudioSession({u3},()=>f(async {v3}=>{v3}.endAudioSession({u3}))):f(async {v3}=>{v3}.endAudioSession({u3})),'
        )
        content = content[:m_rpc.start()] + repl + content[m_rpc.end():]
        modified = True
    else:
        rpc_orig = (
            'streamAudioTranscription:(...n)=>\n'
            'f("streamAudioTranscription",n[0],q=>q.streamAudioTranscription(...n)),'
            'sendAudioChunk:async n=>f(async q=>q.sendAudioChunk(n)),'
            'endAudioSession:async n=>f(async q=>q.endAudioSession(n)),'
        )
        rpc_repl = (
            'streamAudioTranscription:(...n)=>\n'
            'window.__agVoiceBridge?window.__agVoiceBridge.streamAudioTranscription(n[0],n[1],()=>f("streamAudioTranscription",n[0],q=>q.streamAudioTranscription(...n))):f("streamAudioTranscription",n[0],q=>q.streamAudioTranscription(...n)),'
            'sendAudioChunk:async n=>window.__agVoiceBridge?window.__agVoiceBridge.sendAudioChunk(n,()=>f(async q=>q.sendAudioChunk(n))):f(async q=>q.sendAudioChunk(n)),'
            'endAudioSession:async n=>window.__agVoiceBridge?window.__agVoiceBridge.endAudioSession(n,()=>f(async q=>q.endAudioSession(n))):f(async q=>q.endAudioSession(n)),'
        )
        if rpc_orig in content:
            content = content.replace(rpc_orig, rpc_repl, 1)
            modified = True

    # 4. Avoid locking WebView getUserMedia when Android native SpeechRecognizer is active
    mic_ctrl_re = re.compile(
        r'(async function [A-Za-z0-9_$]+\(a,b\)\{)(var c=e,d=e;try\{let f=typeof b==="string"\|\|b===void 0\?\{deviceId:b,autoGainControl:!1\}:b)'
    )
    m_ctrl = mic_ctrl_re.search(content)
    if m_ctrl:
        fn_hdr, fn_body = m_ctrl.groups()
        bypass = (
            'if(b&&typeof b==="object"&&b.createAudioContext&&window.__agVoiceBridge?.shouldUseNativeMic?.())'
            'return{ctx:null,stream:null,sampleRate:16E3,setDevice:()=>Promise.resolve(),reconnect:()=>Promise.resolve(),stop:()=>Promise.resolve()};'
        )
        content = content[:m_ctrl.start()] + fn_hdr + bypass + fn_body + content[m_ctrl.end():]
        modified = True

    if modified:
        print("[web-patch] Successfully patched Android Voice-to-Text (__agVoiceBridge) into main.js")
    else:
        print("[web-patch] WARNING: voice input patterns did not match in main.js", file=sys.stderr)
    return content, modified


def patch_onboarding_layout(content):
    modified = False

    # 1. Responsive login card and onboarding picker cards on narrow mobile viewports
    login_v233_orig = 'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-[480px] max-w-full max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"'
    login_v233_repl = 'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-full max-w-[440px] box-border max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"'
    if login_v233_orig in content:
        content = content.replace(login_v233_orig, login_v233_repl)
        modified = True

    for old_cls, new_cls in [
        ('className:"w-[480px] max-w-full min-h-0 max-h-full flex flex-col overflow-hidden p-6"',
         'className:"w-full max-w-[440px] box-border min-h-0 max-h-full flex flex-col overflow-hidden p-6"'),
        ('className:"w-[480px] max-w-full p-6"',
         'className:"w-full max-w-[440px] box-border p-6"'),
    ]:
        if old_cls in content:
            content = content.replace(old_cls, new_cls)
            modified = True

    # 2. Disable desktop terminal sandbox in permission presets on Android
    for old_s, new_s in [
        ('enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
         'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'),
        ('enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.AUTO',
         'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'),
        ('default:return{sandboxMode:!0,autoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
         'default:return{sandboxMode:!1,autoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'),
        ('sandboxMode:!0,autoExecutionPolicy:I.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
         'sandboxMode:!1,autoExecutionPolicy:I.CascadeCommandsAutoExecution.EAGER'),
    ]:
        if old_s in content:
            content = content.replace(old_s, new_s)
            modified = True

    if modified:
        print("[web-patch] Successfully patched responsive login & onboarding layout in main.js")
    else:
        print("[web-patch] Responsive login & onboarding layout already present in main.js")
    return content, modified


def patch_mcp_plugins_fallback(content):
    if "__agMcpPluginsFallback" in content:
        print("[web-patch] MCP & Plugins fallback already present in main.js")
        return content, False

    plug_re = re.compile(
        r'getAvailableCascadePlugins:async\s+([A-Za-z0-9_$]+)=>f\(([A-Za-z0-9_$]+)=>\2\.getAvailableCascadePlugins\(([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),\1\)\)\),'
        r'getBuildWithGooglePlugins:async\(\)=>f\(([A-Za-z0-9_$]+)=>\5\.getBuildWithGooglePlugins\(\3\(([A-Za-z0-9_$]+),\{\}\)\)\),'
        r'downloadBuildWithGooglePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\9\.pluginId=\7\.uid;return\s+\8\.downloadBuildWithGooglePlugin\(\9\)\}\),'
        r'deletePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\s*\13\.pluginId=\11\.pluginId;return\s+\12\.deletePlugin\(\13\)\}\)'
    )
    m = plug_re.search(content)
    if not m:
        print("[web-patch] WARNING: MCP & Plugins RPC patterns did not match in main.js", file=sys.stderr)
        return content, False

    u1, v1, create_fn, t_avail, u2, t_bwg, u3, v3, w3, t_dl, u4, v4, w4, t_del = m.groups()
    repl = (
        f'getAvailableCascadePlugins:async {u1}=>{{try{{var r=await f({v1}=>{v1}.getAvailableCascadePlugins({create_fn}({t_avail},{u1})));if(r&&r.plugins&&r.plugins.length>0)return r}}catch(_){{}}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getAvailableCascadePlugins({u1}):{{plugins:[]}}}},'
        f'getBuildWithGooglePlugins:async()=>{{try{{var r=await f({u2}=>{u2}.getBuildWithGooglePlugins({create_fn}({t_bwg},{{}})));if(r&&r.plugins&&r.plugins.length>0)return r}}catch(_){{}}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getBuildWithGooglePlugins():{{plugins:[]}}}},'
        f'downloadBuildWithGooglePlugin:async {u3}=>{{try{{return await f(async {v3}=>{{var {w3}={create_fn}({t_dl});{w3}.pluginId={u3}.uid;return {v3}.downloadBuildWithGooglePlugin({w3})}})}}catch(e){{if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.installPluginLocally({u3}.uid);throw e}}}},'
        f'deletePlugin:async {u4}=>{{try{{return await f(async {v4}=>{{var {w4}={create_fn}({t_del});{w4}.pluginId={u4}.pluginId;return {v4}.deletePlugin({w4})}})}}catch(e){{if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.removePluginLocally({u4}.pluginId);throw e}}}}'
    )
    content = content[:m.start()] + repl + content[m.end():]
    print("[web-patch] Successfully patched MCP Store & Plugins fallback into main.js")
    return content, True


def patch_main(file_path):
    if not os.path.isfile(file_path):
        print(f"[web-patch] file not found: {file_path}", file=sys.stderr)
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    content, mod1 = patch_appearance(content)
    content, mod2 = patch_voice_input(content)
    content, mod3 = patch_onboarding_layout(content)
    content, mod4 = patch_mcp_plugins_fallback(content)

    if mod1 or mod2 or mod3 or mod4:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

    return "Desktop Mode" in content and "__agVoiceBridge" in content and "__agMcpPluginsFallback" in content


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "main.js")
    if not patch_main(path):
        sys.exit(1)
