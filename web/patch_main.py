#!/usr/bin/env python3
"""
web/patch_main.py - Dynamic patcher for web/main.js (supports v2.35.0, v2.34.0, and v2.33.0).

Locates and patches:
1. Appearance settings: Desktop Mode toggle (leaving AI Models & Catalogue in Settings nav / Customizations).
2. Voice input: default experiment flags & Android Voice-to-Text (__agVoiceBridge) hooks.
3. Onboarding layout: responsive cards & non-sandboxed mobile terminal defaults.
4. MCP & Plugins fallback (__agMcpPluginsFallback).
5. Voice mode AudioWorklet & getUserMedia mic contention fixes (__agVoiceMicWorkletPatch).
6. Remote project loading & default feature flags (__agRemoteStartupPatch).
7. Agent state stream resync on resume/online/stall (__agStreamResyncPatch).
8. Composer '+' Add context bottom sheet IME focus conflict fix (__agComposerPlusPatch).
9. Sidebar conversation drag-and-drop into folders on touch and desktop (__agDragFoldersPatch).
"""

import sys
import os
import re


def patch_appearance(content):
    if "Desktop Mode" in content or "ag_desktop_mode" in content:
        print("[web-patch] Desktop Mode toggle already present in main.js")
        return content, False

    hook_pattern_v211 = re.compile(
        r'(var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+=>\s*[A-Za-z0-9_$]+=>\{[^}]{0,400}\};)'
    )
    hook_pattern_v233 = re.compile(
        r'([A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3;var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2;)(?=return\s+[A-Za-z0-9_$]+\.createElement\([^,]+,null,[A-Za-z0-9_$]+\.createElement\([^,]+,\{title:"Appearance"\})'
    )

    theme_idx = content.find('{label:"Theme"')
    hook_match = None
    theme_match = None
    react_id = "D"
    win_start = 0
    if theme_idx != -1:
        win_start = max(0, theme_idx - 600)
        win_end = min(len(content), theme_idx + 500)
        window_text = content[win_start:win_end]
        hook_match = hook_pattern_v233.search(window_text) or hook_pattern_v211.search(window_text)
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
    )

    hook_abs_start = win_start + hook_match.start(1)
    hook_abs_end = win_start + hook_match.end(1)
    content = content[:hook_abs_start] + injected_hook + content[hook_abs_end:]
    content = content.replace(orig_theme, injected_theme, 1)
    print(f"[web-patch] Successfully patched Desktop Mode into Appearance (react={react_id}, item={item_comp}, switch={switch_comp})")
    return content, True


def patch_voice_input(content):
    if "__agVoiceBridge" in content:
        print("[web-patch] Android Voice-to-Text (__agVoiceBridge) already present in main.js")
        return content, False

    modified = False

    exp_re = re.compile(
        r'c\|\|\(c=([A-Za-z0-9_$]+)\(a\.stateProvider,([A-Za-z0-9_$]+)=>\(\2=\2\[b\]\)\?!\2\.disabled:!1\),a\.experimentEnabledProviders\.set\(b,c\)\)'
    )
    m_exp = exp_re.search(content)
    if m_exp:
        fn_id, arg_id = m_exp.group(1), m_exp.group(2)
        repl = (
            f'c||(c={fn_id}(a.stateProvider,{arg_id}=>({arg_id}={arg_id}[b])?!{arg_id}.disabled:'
            '(b==="enable-audio-transcription"||b==="enable-remote-ai"||b==="enable-github-decorator"||b==="enable-voice-relay"||b==="enable-move-conversation-to-project")),'
            'a.experimentEnabledProviders.set(b,c))'
        )
        content = content[:m_exp.start()] + repl + content[m_exp.end():]
        modified = True

    mic_orig = 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h)}else b(!1)'
    mic_repl = 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h||!!window.__agVoiceBridge?.hasMicrophone?.())}else b(!!window.__agVoiceBridge?.hasMicrophone?.())'
    if mic_orig in content:
        content = content.replace(mic_orig, mic_repl, 1)
        modified = True

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

    for old_cls, new_cls in [
        ('className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-[480px] max-w-full max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"',
         'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-full max-w-[440px] box-border max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"'),
        ('className:"w-[480px] max-w-full min-h-0 max-h-full flex flex-col overflow-hidden p-6"',
         'className:"w-full max-w-[440px] box-border min-h-0 max-h-full flex flex-col overflow-hidden p-6"'),
        ('className:"w-[480px] max-w-full p-6"',
         'className:"w-full max-w-[440px] box-border p-6"'),
    ]:
        if old_cls in content:
            content = content.replace(old_cls, new_cls)
            modified = True

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
        r'getAvailableCascadePlugins:async\s+([A-Za-z0-9_$]+)=>f\(([A-Za-z0-9_$]+)=>\2\.getAvailableCascadePlugins\(([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),\1\)\)\),\s*'
        r'getBuildWithGooglePlugins:async\(\)=>f\(([A-Za-z0-9_$]+)=>\5\.getBuildWithGooglePlugins\(\3\(([A-Za-z0-9_$]+),\{\}\)\)\),\s*'
        r'downloadBuildWithGooglePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\9\.pluginId=\7\.uid;return\s+\8\.downloadBuildWithGooglePlugin\(\9\)\}\),\s*'
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

    w_anchor = content.find('.audioWorklet.addModule("data:application/javascript;base64,"+btoa(')
    if w_anchor != -1:
        w_start = max(0, w_anchor - 40)
        w_end = min(len(content), w_anchor + 160)
        w_win = content[w_start:w_end]
        worklet_re = re.compile(
            r'([A-Za-z0-9_$]+)\.audioWorklet\.addModule\("data:application/javascript;base64,"\+btoa\(([A-Za-z0-9_$]+)\)\)'
        )
        m_w = worklet_re.search(w_win)
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
            content = content[:w_start + m_w.start()] + repl + content[w_start + m_w.end():]
            modified = True

    g_anchor = content.find('return navigator.mediaDevices.getUserMedia({audio:')
    if g_anchor != -1:
        g_start = max(0, g_anchor - 220)
        g_end = min(len(content), g_anchor + 80)
        g_win = content[g_start:g_end]
        gum_re = re.compile(
            r'(async function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+;try\{)'
            r'(let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\(\3\);)'
            r'if\(!\8\)return navigator\.mediaDevices\.getUserMedia\(\{audio:\2\}\);'
        )
        m_g = gum_re.search(g_win)
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
            content = content[:g_start + m_g.start()] + repl + content[g_start + m_g.end():]
            modified = True

    if modified:
        print("[web-patch] Successfully patched Voice Mode AudioWorklet & mic fallback into main.js")
    else:
        print("[web-patch] WARNING: Voice Mode AudioWorklet/mic patterns did not match in main.js", file=sys.stderr)
    return content, modified


def patch_remote_projects_startup(content):
    """Ensure remote/GitHub projects and folder-move config load immediately at startup."""
    if "__agRemoteStartupPatch" in content:
        print("[web-patch] Remote projects startup patch already present in main.js")
        return content, False

    modified = False

    ui_anchor = content.find('.experiments[')
    if ui_anchor != -1:
        ui_start = max(0, ui_anchor - 80)
        ui_end = min(len(content), ui_anchor + 80)
        ui_win = content[ui_start:ui_end]
        ui_re = re.compile(
            r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)return\(\2=\2\.experiments\[\3\]\)\?!\2\.disabled:!1\}'
        )
        m_ui = ui_re.search(ui_win)
        if m_ui:
            hdr, a_var, b_var = m_ui.groups()
            repl = (
                f'{hdr}/*__agRemoteStartupPatch*/var _x={a_var}.experiments[{b_var}];return _x?!_x.disabled:'
                f'({b_var}==="enable-audio-transcription"||{b_var}==="enable-remote-ai"||{b_var}==="enable-github-decorator"||{b_var}==="enable-voice-relay"||{b_var}==="enable-move-conversation-to-project")}}'
            )
            content = content[:ui_start + m_ui.start()] + repl + content[ui_start + m_ui.end():]
            modified = True

    af_anchor = content.find('.experiments;return Object.keys(')
    if af_anchor != -1:
        af_start = max(0, af_anchor - 80)
        af_end = min(len(content), af_anchor + 120)
        af_win = content[af_start:af_end]
        all_flags_re = re.compile(
            r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=\2\.experiments;)return Object\.keys\(\3\)\.filter\(([A-Za-z0-9_$]+)=>!\3\[\4\]\?\.disabled\)\}'
        )
        m_af = all_flags_re.search(af_win)
        if m_af:
            hdr, _a_var, b_var, c_var = m_af.groups()
            repl = (
                f'{hdr}var _k=Object.keys({b_var}).filter({c_var}=>!{b_var}[{c_var}]?.disabled);'
                f'for(var _f of["enable-audio-transcription","enable-remote-ai","enable-github-decorator","enable-voice-relay","enable-move-conversation-to-project"])'
                f'!{b_var}[_f]&&!_k.includes(_f)&&_k.push(_f);return _k}}'
            )
            content = content[:af_start + m_af.start()] + repl + content[af_start + m_af.end():]
            modified = True

    mr_anchor = content.find('flagOverrideSync.retry()')
    if mr_anchor != -1:
        mr_start = max(0, mr_anchor - 260)
        mr_end = min(len(content), mr_anchor + 200)
        mr_win = content[mr_start:mr_end]
        mendel_retry_re = re.compile(
            r'(async function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{[^}]{0,260}?if\(([A-Za-z0-9_$]+)!==void 0\)\{var [A-Za-z0-9_$]+=\3\.loaded;\3\.loaded=!0;\3\.flagOverrideSync\.retry\(\);[A-Za-z0-9_$]+&&[A-Za-z0-9_$]+\(\3\.experiments,\4\)\|\|\3\.stateProvider\.setState\(\4\))(\}(?:\}(?:finally\{[A-Za-z0-9_$]+\(\)\})?\})?)'
        )
        m_mr = mendel_retry_re.search(mr_win)
        if m_mr:
            hdr, xla_fn, a_var, f_var, tail = m_mr.groups()
            repl = (
                f'{hdr};Object.keys({f_var}).length===0&&!{a_var}.__agMendelRetried&&'
                f'({a_var}.__agMendelRetried=!0,setTimeout(()=>{{{xla_fn}({a_var})}},1500),setTimeout(()=>{{{xla_fn}({a_var})}},3500)){tail}'
            )
            content = content[:mr_start + m_mr.start()] + repl + content[mr_start + m_mr.end():]
            modified = True

    cs_anchor = content.find('projectUpdatesStream({backend:2}')
    if cs_anchor != -1:
        cs_start = max(0, cs_anchor - 120)
        cs_end = min(len(content), cs_anchor + 480)
        cs_win = content[cs_start:cs_end]
        cloud_stream_re = re.compile(
            r'(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)([A-Za-z0-9_$]+\(\{abort:\3,createStream:[A-Za-z0-9_$]+=>\2\.lsClient\.projectUpdatesStream\(\{backend:2\},\{signal:[A-Za-z0-9_$]+\}\),onMessage:[A-Za-z0-9_$]+=>\{[A-Za-z0-9_$]+\.update\.case==="projectList"\?\(\2\.cloudProjectIds=[A-Za-z0-9_$]+\.update\.value\.projectIds,([A-Za-z0-9_$]+)\(\2\)\):[A-Za-z0-9_$]+\.update\.case==="projectUpdatedId"&&[A-Za-z0-9_$]+\(\2,[A-Za-z0-9_$]+\.update\.value\)\},onError:[A-Za-z0-9_$]+=>\{console\.warn\("\[ProjectUpdates\] Cloud stream error:",[A-Za-z0-9_$]+\)\},onDisconnect:\(\)=>\{console\.warn\("\[ProjectUpdates\] Cloud disconnected"\)\}\}\))(\})'
        )
        m_cs = cloud_stream_re.search(cs_win)
        if m_cs:
            hdr, a_var, b_var, body, u7_fn, tail = m_cs.groups()
            repl = (
                f'{hdr}{body};(async()=>{{for(var _i=0;_i<5&&!{b_var}.signal.aborted;_i++){{'
                f'try{{var _r=await {a_var}.lsClient.listProjects({{backend:2}},{{signal:{b_var}.signal}});'
                f'if({b_var}.signal.aborted)break;if(_r?.projectIds?.length>0){{'
                f'if(JSON.stringify(_r.projectIds)!==JSON.stringify({a_var}.cloudProjectIds)){{{a_var}.cloudProjectIds=_r.projectIds;{u7_fn}({a_var})}}break}}}}catch(_){{}}'
                f'await new Promise(_w=>setTimeout(_w,1200))}}}})(){tail}'
            )
            content = content[:cs_start + m_cs.start()] + repl + content[cs_start + m_cs.end():]
            modified = True

    gh_anchor = content.find('("github/repo").then(')
    if gh_anchor != -1:
        gh_start = max(0, gh_anchor - 40)
        gh_end = min(len(content), gh_anchor + 180)
        gh_win = content[gh_start:gh_end]
        gh_repo_re = re.compile(
            r'(([A-Za-z0-9_$]+)\("github/repo"\)\.then\([A-Za-z0-9_$]+=>\{([A-Za-z0-9_$]+)\.current=!0;[^}]+\}\)\.catch\(\(\)=>\{)\3\.current=!0;'
        )
        m_gh = gh_repo_re.search(gh_win)
        if m_gh:
            hdr, _fn_var, ref_var = m_gh.groups()
            content = content[:gh_start + m_gh.start()] + f'{hdr}{ref_var}.current=!1;' + content[gh_start + m_gh.end():]
            modified = True

    if modified:
        print("[web-patch] Successfully patched remote projects startup in main.js")
    else:
        print("[web-patch] WARNING: remote projects startup patterns did not match in main.js", file=sys.stderr)
    return content, modified


def patch_agent_stream_resync(content):
    """Add resume/visibility/stall recovery to consumeAgentStateStream (v2.35 pda & v2.34 kda)."""
    if "__agStreamResyncPatch" in content:
        print("[web-patch] Agent stream resync patch already present in main.js")
        return content, False

    anchor = content.find('"[consumeAgentStateStream] streamAgentStateUpdates error:"')
    if anchor == -1:
        print("[web-patch] WARNING: consumeAgentStateStream anchor not found in main.js", file=sys.stderr)
        return content, False

    win_start = max(0, anchor - 2500)
    win_end = min(len(content), anchor + 600)
    window = content[win_start:win_end]

    # v2.35.0 layout (pda(a,b,c,d,f))
    v235_re = re.compile(
        r'(async function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{'
        r'var ([A-Za-z0-9_$]+)=e,([A-Za-z0-9_$]+)=e;try\{let \{initialStepsSlice:[^}]+\}=[^,]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\(\3\),[^;]+;'
        r'for\(;!\5\.signal\.aborted;\)\{if\([A-Za-z0-9_$]+\)\{[^}]+\}let [A-Za-z0-9_$]+=[A-Za-z0-9_$]+\(\);[A-Za-z0-9_$]+\?\.\([A-Za-z0-9_$]+\);let ([A-Za-z0-9_$]+)=1E3;)'
        r'(try\{let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\([^.]+\.StreamAgentStateUpdatesRequestSchema,\s*\{[^}]+\}\)),([A-Za-z0-9_$]+)=\2\(\12,\{signal:\5\.signal\}\);var ([A-Za-z0-9_$]+)=!1;(for await\(let [A-Za-z0-9_$]+ of \7\(\13\)\)\{\8\(\);try\{)'
        r'(.*?\[consumeAgentStateStream\] streamAgentStateUpdates error:.*?if\(!\14\)break\})'
        r'\5\.signal\.aborted\|\|\8\(await \7\(([A-Za-z0-9_$]+)\(\10,\5\.signal\)\)\);',
        re.DOTALL,
    )
    m = v235_re.search(window)
    if m:
        (
            hdr, a_arg, _b_arg, _c_arg, d_arg, _f_arg,
            g_var, h_var, a_state, i_var,
            req_try, j_var, l_stream_var, k_flag, for_hdr,
            body_to_break, mda_fn,
        ) = m.groups()
        reset_m = re.search(rf'{re.escape(k_flag)}=!0,([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)=0', body_to_break)
        reset_stmt = f'{reset_m.group(1)}=0;{reset_m.group(2)}=0;{reset_m.group(3)}=0' if reset_m else ''
        catch_re = re.compile(
            rf'(.*?\}})(catch\(([A-Za-z0-9_$]+)\)\{{{re.escape(h_var)}\(\);if\({re.escape(d_arg)}\.signal\.aborted\)break;{re.escape(k_flag)}=!0;)(.*)(if\(!{re.escape(k_flag)}\)break\}})$',
            re.DOTALL,
        )
        mc = catch_re.match(body_to_break)
        if mc:
            try_tail, catch_hdr, _err_var, catch_body, catch_tail = mc.groups()
            setup = (
                f'/*__agStreamResyncPatch*/'
                f'var _ac=new AbortController(),_rs=!1,_lm=Date.now(),'
                f'_wh=typeof document!=="undefined"&&document.hidden,'
                f'_oa=()=>{{_ac.abort({d_arg}.signal.reason)}},'
                f'_tr=()=>{{if(!_rs&&!{d_arg}.signal.aborted){{_rs=!0;_ac.abort("agy_stream_resync")}}}},'
                f'_ov=()=>{{if(typeof document!=="undefined"){{if(document.visibilityState==="hidden")_wh=!0;else if(_wh){{_wh=!1;_tr()}}}}}},'
                f'_oh=()=>{{if(_wh||Date.now()-_lm>3E3)_wh=!1,_tr()}};'
                f'{d_arg}.signal.addEventListener("abort",_oa,{{once:!0}});'
                f'if(typeof document!=="undefined")document.addEventListener("visibilitychange",_ov);'
                f'if(typeof window!=="undefined"){{window.addEventListener("agy:host-resume",_oh);window.addEventListener("online",_tr)}}'
                f'var _wd=setInterval(()=>{{if(!_rs&&!{d_arg}.signal.aborted&&({a_state}.status===2||{a_state}.executableStatus===2||{a_state}.executorLoopStatus===2||{a_state}.fullyIdle===!1)&&Date.now()-_lm>2E4)_tr()}},5E3);'
                f'try{{'
            )
            cleanup = (
                f'}}finally{{clearInterval(_wd);{d_arg}.signal.removeEventListener("abort",_oa);'
                f'if(typeof document!=="undefined")document.removeEventListener("visibilitychange",_ov);'
                f'if(typeof window!=="undefined"){{window.removeEventListener("agy:host-resume",_oh);window.removeEventListener("online",_tr)}}}}'
                f'{d_arg}.signal.aborted||{h_var}(await {g_var}({mda_fn}(_rs?50:{i_var},{d_arg}.signal)));'
            )
            else_clause = f'else{{{reset_stmt}}}' if reset_stmt else ''
            repl = (
                f'{hdr}{setup}'
                f'{req_try},{l_stream_var}={a_arg}({j_var},{{signal:_ac.signal}});var {k_flag}=!1;{for_hdr}_lm=Date.now();'
                f'{try_tail}{catch_hdr}if(!_rs){{{catch_body}}}{else_clause}{catch_tail}'
                f'{cleanup}'
            )
            new_window = window[:m.start()] + repl + window[m.end():]
            content = content[:win_start] + new_window + content[win_end:]
            print("[web-patch] Successfully patched v2.35 consumeAgentStateStream (__agStreamResyncPatch)")
            return content, True

    # v2.34.0 fallback (kda)
    kda_re = re.compile(
        r'(async function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{'
        r'var ([A-Za-z0-9_$]+)=e,([A-Za-z0-9_$]+)=e;try\{let \{initialStepsSlice:[^}]+\}=[^,]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\(\3\),[A-Za-z0-9_$]+=[A-Za-z0-9_$]+,[A-Za-z0-9_$]+=0;'
        r'for\(;!\5\.signal\.aborted;\)\{if\([A-Za-z0-9_$]+\)\{[^}]+\}let [A-Za-z0-9_$]+=[A-Za-z0-9_$]+\(\);[A-Za-z0-9_$]+\?\.\([A-Za-z0-9_$]+\);)'
        r'(try\{let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\([^.]+\.StreamAgentStateUpdatesRequestSchema,\{[^}]+\}\)),([A-Za-z0-9_$]+)=\2\(\11,\{signal:\5\.signal\}\);(for await\(let [A-Za-z0-9_$]+ of \7\(\12\)\)\{\8\(\);try\{)'
        r'(.*?\[consumeAgentStateStream\] streamAgentStateUpdates error:.*?if\(!([A-Za-z0-9_$]+)\)break\})'
        r'\5\.signal\.aborted\|\|\8\(await \7\(new Promise\(([A-Za-z0-9_$]+)=>setTimeout\(\16,1E3\)\)\)\);',
        re.DOTALL,
    )
    m = kda_re.search(window)
    if not m:
        print("[web-patch] WARNING: consumeAgentStateStream pattern did not match in main.js", file=sys.stderr)
        return content, False

    (
        hdr, a_arg, _b_arg, _c_arg, d_arg, _f_arg,
        g_var, h_var, z_var,
        req_try, e_var, g_stream_var, for_hdr,
        body_to_break, g_flag, timer_arg,
    ) = m.groups()
    catch_re = re.compile(
        rf'(.*?\}})(catch\(([A-Za-z0-9_$]+)\)\{{{re.escape(h_var)}\(\);if\({re.escape(d_arg)}\.signal\.aborted\)break;let {re.escape(g_flag)}=!0;)(.*)(if\(!{re.escape(g_flag)}\)break\}})$',
        re.DOTALL,
    )
    mc = catch_re.match(body_to_break)
    if not mc:
        print("[web-patch] WARNING: consumeAgentStateStream catch block did not match in main.js", file=sys.stderr)
        return content, False

    try_tail, catch_hdr, _err_var, catch_body, catch_tail = mc.groups()

    setup = (
        f'/*__agStreamResyncPatch*/'
        f'var _ac=new AbortController(),_rs=!1,_lm=Date.now(),'
        f'_wh=typeof document!=="undefined"&&document.hidden,'
        f'_oa=()=>{{_ac.abort({d_arg}.signal.reason)}},'
        f'_tr=()=>{{if(!_rs&&!{d_arg}.signal.aborted){{_rs=!0;_ac.abort("agy_stream_resync")}}}},'
        f'_ov=()=>{{if(typeof document!=="undefined"){{if(document.visibilityState==="hidden")_wh=!0;else if(_wh){{_wh=!1;_tr()}}}}}},'
        f'_oh=()=>{{if(_wh||Date.now()-_lm>3E3)_wh=!1,_tr()}};'
        f'{d_arg}.signal.addEventListener("abort",_oa,{{once:!0}});'
        f'if(typeof document!=="undefined")document.addEventListener("visibilitychange",_ov);'
        f'if(typeof window!=="undefined"){{window.addEventListener("agy:host-resume",_oh);window.addEventListener("online",_tr)}}'
        f'var _wd=setInterval(()=>{{if(!_rs&&!{d_arg}.signal.aborted&&({z_var}.status===2||{z_var}.executableStatus===2||{z_var}.executorLoopStatus===2||{z_var}.fullyIdle===!1)&&Date.now()-_lm>2E4)_tr()}},5E3);'
        f'try{{'
    )
    cleanup = (
        f'}}finally{{clearInterval(_wd);{d_arg}.signal.removeEventListener("abort",_oa);'
        f'if(typeof document!=="undefined")document.removeEventListener("visibilitychange",_ov);'
        f'if(typeof window!=="undefined"){{window.removeEventListener("agy:host-resume",_oh);window.removeEventListener("online",_tr)}}}}'
        f'{d_arg}.signal.aborted||{h_var}(await {g_var}(new Promise({timer_arg}=>setTimeout({timer_arg},_rs?50:1E3))));'
    )
    repl = (
        f'{hdr}{setup}'
        f'{req_try},{g_stream_var}={a_arg}({e_var},{{signal:_ac.signal}});{for_hdr}_lm=Date.now();'
        f'{try_tail}{catch_hdr}if(!_rs){{{catch_body}}}{catch_tail}'
        f'{cleanup}'
    )
    new_window = window[:m.start()] + repl + window[m.end():]
    content = content[:win_start] + new_window + content[win_end:]
    print("[web-patch] Successfully patched consumeAgentStateStream (__agStreamResyncPatch) into main.js")
    return content, True


def patch_composer_plus_button(content):
    """Fix Issue #1: prevent '+' Add context sheet dismissal from auto-focusing IME input."""
    if "__agComposerPlusPatch" in content:
        print("[web-patch] Composer '+' IME conflict patch already present in main.js")
        return content, False

    anchor = content.find('"aria-label":"Add context"')
    if anchor == -1:
        print("[web-patch] WARNING: Add context button anchor not found in main.js", file=sys.stderr)
        return content, False

    win_start = max(0, anchor - 300)
    win_end = min(len(content), anchor + 600)
    win = content[win_start:win_end]

    plus_re = re.compile(
        r'("aria-label":"Add context",\s*"data-tooltip-id":[^}]+?\},\s*[A-Za-z0-9_$]+\.createElement\([^}]+\}\)\)\),\s*'
        r'[A-Za-z0-9_$]+\.createElement\([A-Za-z0-9_$]+,\{side:[^,]+,align:[^,]+,)(finalFocus:[A-Za-z0-9_$]+\?[A-Za-z0-9_$]+:void 0)(,className:)'
    )
    m = plus_re.search(win)
    if not m:
        print("[web-patch] WARNING: Composer '+' finalFocus pattern did not match in main.js", file=sys.stderr)
        return content, False

    new_win = win[:m.start()] + f'{m.group(1)}/*__agComposerPlusPatch*/finalFocus:!1{m.group(3)}' + win[m.end():]
    # Also ensure explicit button type so Android WebView never misinterprets button activation
    new_win = new_win.replace('"aria-label":"Add context"', '"type":"button","aria-label":"Add context"', 1)
    content = content[:win_start] + new_win + content[win_end:]
    print("[web-patch] Successfully patched composer '+' menu IME conflict (__agComposerPlusPatch)")
    return content, True


def patch_conversation_drag_folders(content):
    """Enable touch & desktop drag-and-drop to move conversations into any available folder."""
    if "__agDragFoldersPatch" in content:
        print("[web-patch] Conversation folder drag-and-drop already present in main.js")
        return content, False

    modified = False

    # 1. Enable moveConversationToProject feature default so Workspace/Project folder drops & moves work
    cfg_orig = 'moveConversationToProject:{feature:{enabled:!1}'
    cfg_repl = 'moveConversationToProject:{/*__agDragFoldersPatch*/feature:{enabled:!0}'
    if cfg_orig in content:
        content = content.replace(cfg_orig, cfg_repl, 1)
        modified = True

    # 2. Unlock ALL non-placeholder, non-coordinator Workspace/Project folders (local + cloud)
    t9c_anchor = content.find('a.project.id!=="outside-of-project"}')
    if t9c_anchor != -1:
        ts = max(0, t9c_anchor - 220)
        te = min(len(content), t9c_anchor + 600)
        twin = content[ts:te]
        t9c_re = re.compile(
            r'function ([A-Za-z0-9_$]+)\(a\)\{return [A-Za-z0-9_$]+\(a\)&&!a\.project\.coordinator&&a\.project\.id!=="outside-of-project"\}'
            r'function ([A-Za-z0-9_$]+)\(a,b,c,d\)\{a=a&&a!=="outside-of-project"\?a:void 0;return a!==void 0\?c\.has\(a\):b\|\|d\}'
        )
        m_t = t9c_re.search(twin)
        if m_t:
            fn1, fn2 = m_t.groups()
            repl = (
                f'function {fn1}(a){{/*__agDragFoldersPatch*/return!!a?.project?.id&&!a.isPlaceholder&&!a.project.coordinator&&a.project.id!=="outside-of-project"}}'
                f'function {fn2}(a,b,c,d){{a=a&&a!=="outside-of-project"?a:void 0;return a!==void 0?c.has(a):c.size>0||b||d}}'
            )
            twin = twin[:m_t.start()] + repl + twin[m_t.end():]
            content = content[:ts] + twin + content[te:]
            modified = True

        # Update submenu icon from "cloud" to "folder" since local workspaces are also included
        mv_anchor = content.find('id:"move-to-project"')
        if mv_anchor != -1:
            ms = mv_anchor
            me = min(len(content), mv_anchor + 180)
            mwin = content[ms:me]
            mwin_new = re.sub(r'([A-Za-z0-9_$]+)\("cloud"\)', r'\1("folder")', mwin, count=1)
            if mwin_new != mwin:
                content = content[:ms] + mwin_new + content[me:]
                modified = True

    # 3. Allow sidebar row drag handlers on mobile too (remove !isMobile gate on Xb.type==="row")
    row_gate_re = re.compile(r'if\(![A-Za-z0-9_$]+&&([A-Za-z0-9_$]+)\.type==="row"\)return ([A-Za-z0-9_$]+)\(\1\);')
    m_rg = row_gate_re.search(content)
    if m_rg:
        row_var, prop_fn = m_rg.groups()
        content = content[:m_rg.start()] + f'if({row_var}.type==="row")return {prop_fn}({row_var});' + content[m_rg.end():]
        modified = True

    # 4. Upgrade i6c pointer drag hook with touch long-press / drag-handle support
    i6c_anchor = content.find('dataset.testid="pointer-drag-shield"')
    if i6c_anchor != -1:
        is_start = max(0, i6c_anchor - 2000)
        is_end = min(len(content), i6c_anchor + 1000)
        iwin = content[is_start:is_end]
        i6c_re = re.compile(
            r'(w=\(0,([A-Za-z0-9_$]+)\.useRef\)\(null\),x=\(0,\2\.useCallback\)\(\(\)=>\{q\.current\?\.remove\(\);q\.current=null\},\[\]\),'
            r'y=\(0,\2\.useCallback\)\(\(\)=>\s*\{r\.current&&window\.removeEventListener\("pointermove",r\.current\);'
            r'u\.current&&window\.removeEventListener\("pointerup",u\.current\);'
            r'v\.current&&window\.removeEventListener\("pointercancel",v\.current\);'
            r'w\.current&&window\.removeEventListener\("keydown",w\.current,!0\);'
            r'r\.current=null;u\.current=null;v\.current=null;w\.current=null\},\[\]\);)'
            r'(.*?\},\[y,x\]\);a=\(0,\2\.useCallback\)\(\(A,\s*B\)=>\{if\(B\.button===0&&!\(p\.current\|\|B\.target\?\.closest\?\.\("\[data-no-drag\]"\)\|\|'
            r'B\.target\?\.closest\?\.\(\'input, textarea, \[contenteditable="true"\]\'\)\|\|document\.querySelector\([^)]+\)\)\)\{)'
            r'y\(\);var C=n\.current,D=m\.current\.indexOf\(A\);if\(D!==-1\)\{'
            r'var F=C\.getCoord\(B\),H=B\.clientX,I=B\.clientY,J=C\.threshold\?\?5,L=!1;'
            r'k\.current&&\(clearTimeout\(k\.current\),k\.current=null,h\(!1\)\);'
            r'B=P=>\{.*?\};'
            r'var M=P=>\{.*?\};'
            r'C=\(\)=>\{M\(!0\)\};var N=\(\)=>\{M\(!1\)\},O=P=>\{P\.key==="Escape"&&L&&\(P\.preventDefault\(\),P\.stopPropagation\(\),M\(!1\)\)\};'
            r'r\.current=B;u\.current=C;v\.current=N;w\.current=O;'
            r'window\.addEventListener\("pointermove",\s*B\);window\.addEventListener\("pointerup",C\);window\.addEventListener\("pointercancel",N\);window\.addEventListener\("keydown",O,!0\)\}\}',
            re.DOTALL,
        )
        m_i = i6c_re.search(iwin)
        if m_i:
            y_block, react_id, mid_and_pd_header = m_i.groups()
            y_new = re.sub(
                r'r\.current=null;u\.current=null;v\.current=null;w\.current=null\},\[\]\);$',
                f'r.current=null;u.current=null;v.current=null;w.current=null;_tc.current?.();_tc.current=null}},[]);var _tc=(0,{react_id}.useRef)(null);',
                y_block,
                count=1,
            )
            new_pd_body = (
                'y();var C=n.current,D=m.current.indexOf(A);if(D!==-1){'
                'var F=C.getCoord(B),H=B.clientX,I=B.clientY,J=C.threshold??5,L=!1,'
                '_isT=B.pointerType==="touch",_dh=!!B.target?.closest?.("[data-agy-drag-handle]"),'
                '_arm=!_isT||_dh,_tmr=null,_hb=!1;'
                'k.current&&(clearTimeout(k.current),k.current=null,h(!1));'
                'var _start=(P)=>{L=!0;p.current=!0;h(!0);'
                'if(_isT&&!_hb){_hb=!0;try{window.Android?.performHapticFeedback?.("long_press")}catch(_){}}'
                'document.body.style.cursor="grabbing";document.body.style.userSelect="none";x();'
                'var R=document.createElement("div");R.dataset.testid="pointer-drag-shield";R.style.position="fixed";'
                'R.style.inset="0";R.style.zIndex="9999";R.style.cursor="grabbing";R.style.touchAction="none";'
                'document.body.appendChild(R);q.current=R;window.getSelection()?.removeAllRanges();'
                'f(n.current.beginDrag({index:D,itemId:A,itemRefs:l.current,items:m.current,startCoord:F,startX:H,startY:I,event:P}))};'
                'B=P=>{if(P.buttons===0)M(!1);else{var R=n.current.getCoord(P);'
                'if(L)d.current!=null&&f(n.current.updateDrag(d.current,R,P));'
                'else if(n.current.use2dThreshold?Math.max(Math.abs(P.clientX-H),Math.abs(P.clientY-I))>=J:Math.abs(R-F)>=J)_start(P)}};'
                'var M=P=>{_tmr&&(clearTimeout(_tmr),_tmr=null);y();x();document.body.style.cursor="";document.body.style.userSelect="";'
                'n.current.onDragEnd?.();if(L){if(P&&(P=d.current,P!=null&&(P=n.current.getReorder(P,m.current))))n.current.onReorder(P);'
                'f(null);k.current=setTimeout(()=>{h(!1);k.current=null},100)}p.current=!1};'
                'C=()=>{M(!0)};var N=()=>{M(!1)},O=P=>{P.key==="Escape"&&L&&(P.preventDefault(),P.stopPropagation(),M(!1))};'
                'if(_isT){'
                'if(!_arm){_tmr=setTimeout(()=>{_tmr=null;_arm=!0},170)}'
                'var _tm=ev=>{var t=ev.touches?.[0];if(!t)return;'
                'var se={clientX:t.clientX,clientY:t.clientY,buttons:1,target:ev.target,pointerType:"touch"},'
                'dx=t.clientX-H,dy=t.clientY-I,dist=Math.hypot(dx,dy);'
                'if(!L){if(!_arm){if(dist>9){M(!1)}return}if(dist<(_dh?2:6))return;'
                'if(ev.cancelable)ev.preventDefault();_start(se);return}'
                'if(ev.cancelable)ev.preventDefault();B(se)},'
                '_te=ev=>{if(L&&ev.cancelable)ev.preventDefault();C()},'
                '_tx=()=>{N()},'
                '_cm=ev=>{if(!L)N();else{ev.preventDefault();ev.stopPropagation()}};'
                '_tc.current=()=>{_tmr&&(clearTimeout(_tmr),_tmr=null);'
                'window.removeEventListener("touchmove",_tm,{capture:!0});'
                'window.removeEventListener("touchend",_te,{capture:!0});'
                'window.removeEventListener("touchcancel",_tx,{capture:!0});'
                'window.removeEventListener("contextmenu",_cm,{capture:!0})};'
                'w.current=O;window.addEventListener("touchmove",_tm,{passive:!1,capture:!0});'
                'window.addEventListener("touchend",_te,{passive:!1,capture:!0});'
                'window.addEventListener("touchcancel",_tx,{capture:!0});'
                'window.addEventListener("contextmenu",_cm,{capture:!0});window.addEventListener("keydown",O,!0)'
                '}else{r.current=B;u.current=C;v.current=N;w.current=O;'
                'window.addEventListener("pointermove",B);window.addEventListener("pointerup",C);window.addEventListener("pointercancel",N);window.addEventListener("keydown",O,!0)}}}'
            )
            iwin_new = iwin[:m_i.start()] + y_new + mid_and_pd_header + new_pd_body + iwin[m_i.end():]
            content = content[:is_start] + iwin_new + content[is_end:]
            modified = True

    # 5. Render a touch drag handle grip on mobile sidebar conversation rows (b$c)
    ts_anchor = content.find('timestamp:b==="sidebar"?"idleOnly":"always"')
    if ts_anchor != -1:
        rs = max(0, ts_anchor - 350)
        re_pos = min(len(content), ts_anchor + 150)
        rwin = content[rs:re_pos]
        grip_re = re.compile(
            r'(\(([A-Za-z0-9_$]+)\)\?([A-Za-z0-9_$]+):([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{cascadeId:a,timestamp:b==="sidebar"\?"idleOnly":"always"\}\)\)\))'
            r'(?=,U\?\4\.createElement)'
        )
        # Simpler direct pattern around ce?se:E.createElement(da,...)
        grip_re2 = re.compile(
            r'(([A-Za-z0-9_$]+)\?([A-Za-z0-9_$]+):([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{cascadeId:a,timestamp:b==="sidebar"\?"idleOnly":"always"\}\))\)\)(?=,)'
        )
        m_g = grip_re2.search(rwin)
        if m_g:
            orig_ts = m_g.group(1)
            r_id = m_g.group(4)
            # Detect icon component (Ew / sx) nearby in b$c
            icon_m = re.search(r'([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{name:"keep"', content[max(0, ts_anchor - 500):ts_anchor])
            icon_comp = icon_m.group(2) if icon_m else "sx"
            grip_jsx = (
                f'{orig_ts},y&&b==="sidebar"&&!fd&&!h&&{r_id}.createElement("span",'
                f'{{"data-agy-drag-handle":"true","aria-hidden":"true",'
                f'onClick:ve=>{{ve.preventDefault();ve.stopPropagation()}},'
                f'style:{{touchAction:"none"}},'
                f'className:"pointer-events-auto flex items-center justify-center w-6 h-6 -my-1 -mr-1 rounded text-muted-foreground/50 active:text-foreground cursor-grab"}},'
                f'{r_id}.createElement({icon_comp},{{name:"drag_indicator",size:15}}))))'
            )
            rwin_new = rwin[:m_g.start()] + grip_jsx + rwin[m_g.end():]
            content = content[:rs] + rwin_new + content[re_pos:]
            modified = True

    if modified:
        print("[web-patch] Successfully patched conversation folder drag-and-drop (__agDragFoldersPatch)")
    else:
        print("[web-patch] WARNING: conversation folder drag-and-drop patterns did not match", file=sys.stderr)
    return content, modified


def patch_main(file_path):
    if not os.path.isfile(file_path):
        print(f"[web-patch] file not found: {file_path}", file=sys.stderr)
        return False

    with open(file_path, "r", encoding="utf-8", newline="") as f:
        content = f.read()

    content, mod1 = patch_appearance(content)
    content, mod2 = patch_voice_input(content)
    content, mod3 = patch_onboarding_layout(content)
    content, mod4 = patch_mcp_plugins_fallback(content)
    content, mod5 = patch_voice_mode_worklet(content)
    content, mod6 = patch_remote_projects_startup(content)
    content, mod7 = patch_agent_stream_resync(content)
    content, mod8 = patch_composer_plus_button(content)
    content, mod9 = patch_conversation_drag_folders(content)

    if any((mod1, mod2, mod3, mod4, mod5, mod6, mod7, mod8, mod9)):
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            f.write(content)

    return (
        "Desktop Mode" in content
        and "AI Models & API Keys" not in content
        and "Skills & Plugins Catalogue" not in content
        and "__agVoiceBridge" in content
        and "__agMcpPluginsFallback" in content
        and "__agVoiceMicWorkletPatch" in content
        and "__agRemoteStartupPatch" in content
        and "__agStreamResyncPatch" in content
        and "__agComposerPlusPatch" in content
        and "__agDragFoldersPatch" in content
        and "_isT=B.pointerType" in content
        and "data-agy-drag-handle" in content
    )


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "main.js")
    if not patch_main(path):
        sys.exit(1)
