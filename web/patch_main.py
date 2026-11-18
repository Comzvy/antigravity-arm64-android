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

    # 1. Force default-enabled experiment flags when Mendel flags have not loaded yet
    exp_re = re.compile(
        r'c\|\|\(c=([A-Za-z0-9_$]+)\(a\.stateProvider,([A-Za-z0-9_$]+)=>\(\2=\2\[b\]\)\?!\2\.disabled:!1\),a\.experimentEnabledProviders\.set\(b,c\)\)'
    )
    m_exp = exp_re.search(content)
    if m_exp:
        fn_id, arg_id = m_exp.group(1), m_exp.group(2)
        repl = (
            f'c||(c={fn_id}(a.stateProvider,{arg_id}=>({arg_id}={arg_id}[b])?!{arg_id}.disabled:'
            '(b==="enable-audio-transcription"||b==="enable-remote-ai"||b==="enable-github-decorator"||b==="enable-voice-relay")),'
            'a.experimentEnabledProviders.set(b,c))'
        )
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


def patch_voice_mode_worklet(content):
    """Fix Voice Mode AudioWorklet CSP failure and Android getUserMedia mic contention."""
    if "__agVoiceMicWorkletPatch" in content:
        print("[web-patch] Voice Mode AudioWorklet & mic fallback already present in main.js")
        return content, False

    modified = False

    # 1. Load ./audio_processor.js ('self') with Blob/data fallback instead of bare data: URL
    worklet_re = re.compile(
        r'([A-Za-z0-9_$]+)\.audioWorklet\.addModule\("data:application/javascript;base64,"\+btoa\(([A-Za-z0-9_$]+)\)\)'
    )
    m_w = worklet_re.search(content)
    if m_w:
        ctx_var, src_var = m_w.groups()
        repl = (
            f'(/*__agVoiceMicWorkletPatch*/async()=>{{'
            f'try{{return await {ctx_var}.audioWorklet.addModule("./audio_processor.js")}}catch(_a){{'
            f'try{{var _b=URL.createObjectURL(new Blob([{src_var}],{{type:"application/javascript"}}));'
            f'try{{return await {ctx_var}.audioWorklet.addModule(_b)}}finally{{URL.revokeObjectURL(_b)}}}}'
            f'catch(_c){{return {ctx_var}.audioWorklet.addModule("data:application/javascript;base64,"+btoa({src_var}))}}'
            f'}}}})()'
        )
        content = content[:m_w.start()] + repl + content[m_w.end():]
        modified = True

    # 2. Release any native SpeechRecognizer hold and retry getUserMedia with simpler constraints
    gum_re = re.compile(
        r'(async function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+;try\{)'
        r'(let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\(\3\);)'
        r'if\(!\8\)return navigator\.mediaDevices\.getUserMedia\(\{audio:\2\}\);'
    )
    m_g = gum_re.search(content)
    if m_g:
        hdr, a_arg, _b_arg, c_arg, d_var, f_var, let_g, g_var = m_g.groups()
        repl = (
            f'{hdr}try{{window.Android?.cancelVoiceRecognition?.(window.__AG_NATIVE_BRIDGE_TOKEN__||"","")}}catch(_){{}}'
            f'{let_g}if(!{g_var}){{'
            f'try{{return {f_var}(await {d_var}(navigator.mediaDevices.getUserMedia({{audio:{a_arg}}})))}}catch(_e1){{'
            f'{f_var}();var _n1=_e1?.name;if({c_arg}?.()||_n1==="NotAllowedError"||_n1==="SecurityError")throw _e1;'
            f'{f_var}(await {d_var}(new Promise(_r=>{{window.setTimeout(_r,150)}})));if({c_arg}?.())throw _e1;'
            f'try{{return {f_var}(await {d_var}(navigator.mediaDevices.getUserMedia({{audio:{{echoCancellation:!0,noiseSuppression:!0}}}})))}}catch(_e2){{'
            f'{f_var}();var _n2=_e2?.name;if({c_arg}?.()||_n2==="NotAllowedError"||_n2==="SecurityError")throw _e2;'
            f'return navigator.mediaDevices.getUserMedia({{audio:!0}})}}}}}}'
        )
        content = content[:m_g.start()] + repl + content[m_g.end():]
        modified = True

    if modified:
        print("[web-patch] Successfully patched Voice Mode AudioWorklet & mic fallback into main.js")
    else:
        print("[web-patch] WARNING: Voice Mode AudioWorklet/mic patterns did not match in main.js", file=sys.stderr)
    return content, modified


def patch_remote_projects_startup(content):
    """Ensure remote/GitHub projects load immediately at startup without waiting for delayed Mendel sync."""
    if "__agRemoteStartupPatch" in content:
        print("[web-patch] Remote projects startup patch already present in main.js")
        return content, False

    modified = False

    # 1. Default enable-remote-ai, enable-github-decorator, enable-voice-relay, enable-audio-transcription in Ui()
    ui_re = re.compile(
        r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)return\(\2=\2\.experiments\[\3\]\)\?!\2\.disabled:!1\}'
    )
    m_ui = ui_re.search(content)
    if m_ui:
        hdr, a_var, b_var = m_ui.groups()
        repl = (
            f'{hdr}/*__agRemoteStartupPatch*/var _x={a_var}.experiments[{b_var}];return _x?!_x.disabled:'
            f'({b_var}==="enable-audio-transcription"||{b_var}==="enable-remote-ai"||{b_var}==="enable-github-decorator"||{b_var}==="enable-voice-relay")}}'
        )
        content = content[:m_ui.start()] + repl + content[m_ui.end():]
        modified = True

    # 2. Include those default-enabled flags in $la() before Mendel finishes warming up
    all_flags_re = re.compile(
        r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=\2\.experiments;)return Object\.keys\(\3\)\.filter\(([A-Za-z0-9_$]+)=>!\3\[\4\]\?\.disabled\)\}'
    )
    m_af = all_flags_re.search(content)
    if m_af:
        hdr, _a_var, b_var, c_var = m_af.groups()
        repl = (
            f'{hdr}var _k=Object.keys({b_var}).filter({c_var}=>!{b_var}[{c_var}]?.disabled);'
            f'for(var _f of["enable-audio-transcription","enable-remote-ai","enable-github-decorator","enable-voice-relay"])'
            f'!{b_var}[_f]&&!_k.includes(_f)&&_k.push(_f);return _k}}'
        )
        content = content[:m_af.start()] + repl + content[m_af.end():]
        modified = True

    # 3. Retry GetMendelFlags quickly when initial call returns {} during server startup refresh
    mendel_retry_re = re.compile(
        r'(async function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{[^}]{0,260}?if\(([A-Za-z0-9_$]+)!==void 0\)\{var [A-Za-z0-9_$]+=\3\.loaded;\3\.loaded=!0;\3\.flagOverrideSync\.retry\(\);[A-Za-z0-9_$]+&&[A-Za-z0-9_$]+\(\3\.experiments,\4\)\|\|\3\.stateProvider\.setState\(\4\))(\}\})'
    )
    m_mr = mendel_retry_re.search(content)
    if m_mr:
        hdr, xla_fn, a_var, f_var, tail = m_mr.groups()
        repl = (
            f'{hdr};Object.keys({f_var}).length===0&&!{a_var}.__agMendelRetried&&'
            f'({a_var}.__agMendelRetried=!0,setTimeout(()=>{{{xla_fn}({a_var})}},1500),setTimeout(()=>{{{xla_fn}({a_var})}},3500)){tail}'
        )
        content = content[:m_mr.start()] + repl + content[m_mr.end():]
        modified = True

    # 4. Poll listProjects({backend:2}) on cloud startup in yld() until server finishes auth/state refresh
    cloud_stream_re = re.compile(
        r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)(Li\(\{abort:\3,createStream:[A-Za-z0-9_$]+=>\2\.lsClient\.projectUpdatesStream\(\{backend:2\},\{signal:[A-Za-z0-9_$]+\}\),onMessage:[A-Za-z0-9_$]+=>\{[A-Za-z0-9_$]+\.update\.case==="projectList"\?\(\2\.cloudProjectIds=[A-Za-z0-9_$]+\.update\.value\.projectIds,([A-Za-z0-9_$]+)\(\2\)\):[A-Za-z0-9_$]+\.update\.case==="projectUpdatedId"&&[A-Za-z0-9_$]+\(\2,[A-Za-z0-9_$]+\.update\.value\)\},onError:[A-Za-z0-9_$]+=>\{console\.warn\("\[ProjectUpdates\] Cloud stream error:",[A-Za-z0-9_$]+\)\},onDisconnect:\(\)=>\{console\.warn\("\[ProjectUpdates\] Cloud disconnected"\)\}\}\))(\})'
    )
    m_cs = cloud_stream_re.search(content)
    if m_cs:
        hdr, a_var, b_var, body, u7_fn, tail = m_cs.groups()
        repl = (
            f'{hdr}{body};(async()=>{{for(var _i=0;_i<5&&!{b_var}.signal.aborted;_i++){{'
            f'try{{var _r=await {a_var}.lsClient.listProjects({{backend:2}},{{signal:{b_var}.signal}});'
            f'if({b_var}.signal.aborted)break;if(_r?.projectIds?.length>0){{'
            f'if(JSON.stringify(_r.projectIds)!==JSON.stringify({a_var}.cloudProjectIds)){{{a_var}.cloudProjectIds=_r.projectIds;{u7_fn}({a_var})}}break}}}}catch(_){{}}'
            f'await new Promise(_w=>setTimeout(_w,1200))}}}})(){tail}'
        )
        content = content[:m_cs.start()] + repl + content[m_cs.end():]
        modified = True

    # 5. Allow retrying GitHub repository fetch after transient startup errors
    gh_repo_re = re.compile(
        r'(([A-Za-z0-9_$]+)\("github/repo"\)\.then\([A-Za-z0-9_$]+=>\{([A-Za-z0-9_$]+)\.current=!0;[^}]+\}\)\.catch\(\(\)=>\{)\3\.current=!0;'
    )
    m_gh = gh_repo_re.search(content)
    if m_gh:
        hdr, _fn_var, ref_var = m_gh.groups()
        content = content[:m_gh.start()] + f'{hdr}{ref_var}.current=!1;' + content[m_gh.end():]
        modified = True

    if modified:
        print("[web-patch] Successfully patched remote projects startup in main.js")
    else:
        print("[web-patch] WARNING: remote projects startup patterns did not match in main.js", file=sys.stderr)
    return content, modified


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
    content, mod5 = patch_voice_mode_worklet(content)
    content, mod6 = patch_remote_projects_startup(content)

    if mod1 or mod2 or mod3 or mod4 or mod5 or mod6:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

    return (
        "Desktop Mode" in content
        and "__agVoiceBridge" in content
        and "__agMcpPluginsFallback" in content
        and "__agVoiceMicWorkletPatch" in content
        and "__agRemoteStartupPatch" in content
    )


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "main.js")
    if not patch_main(path):
        sys.exit(1)
