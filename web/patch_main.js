#!/usr/bin/env node
/**
 * web/patch_main.js - Node.js equivalent of web/patch_main.py for Windows/offline builds.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function patchAppearance(content) {
  if (content.includes('Desktop Mode') || content.includes('ag_desktop_mode')) {
    console.log('[web-patch] Desktop Mode toggle already present in main.js');
    return [content, false];
  }
  const tIdx = content.indexOf('{label:"Theme"');
  let hm = null, tm = null, reactId = 'D', winStart = 0;
  if (tIdx !== -1) {
    winStart = Math.max(0, tIdx - 600);
    const win = content.slice(winStart, Math.min(content.length, tIdx + 500));
    const hookReV233 = /([A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3;var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2;)(?=return\s+[A-Za-z0-9_$]+\.createElement\([^,]+,null,[A-Za-z0-9_$]+\.createElement\([^,]+,\{title:"Appearance"\})/;
    const hookReV211 = /(var\s+[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==3,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+!==2,\s*[A-Za-z0-9_$]+=[A-Za-z0-9_$]+=>\s*[A-Za-z0-9_$]+=>\{[^}]{0,400}\};)/;
    hm = hookReV233.exec(win) || hookReV211.exec(win);
    tm = /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:"Theme",.*?onSelect:[A-Za-z0-9_$]+\}\)/.exec(win);
    if (tm) reactId = tm[1];
  }
  if (!hm || !tm) throw new Error('appearance patterns not matched');

  const origHook = hm[1];
  const injHook =
    `var [isDesktop,setIsDesktop]=(0,${reactId}.useState)(()=>{try{if(window.Android&&typeof window.Android.isDesktopMode==='function')return window.Android.isDesktopMode();var s=localStorage.getItem('ag_desktop_mode');return s===null?!1:s==='true'}catch(_){return !1}});` +
    `var onDesktopToggle=(0,${reactId}.useCallback)(v=>{setIsDesktop(v);try{localStorage.setItem('ag_desktop_mode',String(v));if(window.Android&&typeof window.Android.setDesktopMode==='function')window.Android.setDesktopMode(v)}catch(_){}},[]);` +
    origHook;

  let itemComp = 'bT', switchComp = 'eT';
  for (const m of content.matchAll(/rightElement:/g)) {
    const rw = content.slice(Math.max(0, m.index - 180), Math.min(content.length, m.index + 180));
    const sw = /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{label:[^}]+,rightElement:[A-Za-z0-9_$]+\.createElement\(([A-Za-z0-9_$]+),\{checked:/.exec(rw);
    if (sw) { itemComp = sw[2]; switchComp = sw[3]; break; }
  }
  const origTheme = tm[0];
  const injTheme = origTheme +
    `,${reactId}.createElement(${itemComp},{label:"Desktop Mode",description:"Use desktop viewport and user agent for the workspace",rightElement:${reactId}.createElement(${switchComp},{checked:isDesktop,onCheckedChange:onDesktopToggle})})`;

  const hookAbsStart = winStart + hm.index;
  const hookAbsEnd = hookAbsStart + origHook.length;
  content = (content.slice(0, hookAbsStart) + injHook + content.slice(hookAbsEnd)).replace(origTheme, injTheme);
  return [content, true];
}

function patchVoiceInput(content) {
  if (content.includes('__agVoiceBridge')) return [content, false];
  let mod = false;
  content = content.replace(
    /c\|\|\(c=([A-Za-z0-9_$]+)\(a\.stateProvider,([A-Za-z0-9_$]+)=>\(\2=\2\[b\]\)\?!\2\.disabled:!1\),a\.experimentEnabledProviders\.set\(b,c\)\)/,
    (_, fnId, argId) => {
      mod = true;
      return `c||(c=${fnId}(a.stateProvider,${argId}=>(${argId}=${argId}[b])?!${argId}.disabled:(b==="enable-audio-transcription"||b==="enable-remote-ai"||b==="enable-github-decorator"||b==="enable-voice-relay"||b==="enable-move-conversation-to-project")),a.experimentEnabledProviders.set(b,c))`;
    }
  );
  const micOrig = 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h)}else b(!1)';
  if (content.includes(micOrig)) {
    content = content.replace(micOrig, 'var h=g(await f(navigator.mediaDevices.enumerateDevices())).some(k=>k.kind==="audioinput");b(h||!!window.__agVoiceBridge?.hasMicrophone?.())}else b(!!window.__agVoiceBridge?.hasMicrophone?.())');
    mod = true;
  }
  content = content.replace(
    /streamAudioTranscription:\(\.\.\.([A-Za-z0-9_$]+)\)=>\s*f\(([A-Za-z0-9_$]+)=>\2\.streamAudioTranscription\(\.\.\.\1\)\),sendAudioChunk:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\4\.sendAudioChunk\(\3\)\),endAudioSession:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\6\.endAudioSession\(\5\)\),/,
    (_, u1, v1, u2, v2, u3, v3) => {
      mod = true;
      return (
        `streamAudioTranscription:(...${u1})=>window.__agVoiceBridge?window.__agVoiceBridge.streamAudioTranscription(${u1}[0],${u1}[1],()=>f(${v1}=>${v1}.streamAudioTranscription(...${u1}))):f(${v1}=>${v1}.streamAudioTranscription(...${u1})),` +
        `sendAudioChunk:async ${u2}=>window.__agVoiceBridge?window.__agVoiceBridge.sendAudioChunk(${u2},()=>f(async ${v2}=>${v2}.sendAudioChunk(${u2}))):f(async ${v2}=>${v2}.sendAudioChunk(${u2})),` +
        `endAudioSession:async ${u3}=>window.__agVoiceBridge?window.__agVoiceBridge.endAudioSession(${u3},()=>f(async ${v3}=>${v3}.endAudioSession(${u3}))):f(async ${v3}=>${v3}.endAudioSession(${u3})),`
      );
    }
  );
  content = content.replace(
    /(async function [A-Za-z0-9_$]+\(a,b\)\{)(var c=e,d=e;try\{let f=typeof b==="string"\|\|b===void 0\?\{deviceId:b,autoGainControl:!1\}:b)/,
    '$1if(b&&typeof b==="object"&&b.createAudioContext&&window.__agVoiceBridge?.shouldUseNativeMic?.())return{ctx:null,stream:null,sampleRate:16E3,setDevice:()=>Promise.resolve(),reconnect:()=>Promise.resolve(),stop:()=>Promise.resolve()};$2'
  );
  return [content, mod];
}

function patchOnboardingLayout(content) {
  let mod = false;
  const pairs = [
    ['className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-[480px] max-w-full max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"',
     'className:"relative border border-border bg-card rounded-2xl shadow-sm !bg-card/90 w-full max-w-[440px] box-border max-h-[440px] overflow-y-auto [scrollbar-gutter:stable_both-edges] p-6 flex flex-col items-center gap-4 mb-4"'],
    ['className:"w-[480px] max-w-full min-h-0 max-h-full flex flex-col overflow-hidden p-6"',
     'className:"w-full max-w-[440px] box-border min-h-0 max-h-full flex flex-col overflow-hidden p-6"'],
    ['className:"w-[480px] max-w-full p-6"',
     'className:"w-full max-w-[440px] box-border p-6"'],
    ['enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
     'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'],
    ['enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.AUTO',
     'enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'],
    ['default:return{sandboxMode:!0,autoExecutionPolicy:F.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
     'default:return{sandboxMode:!1,autoExecutionPolicy:F.CascadeCommandsAutoExecution.EAGER'],
    ['sandboxMode:!0,autoExecutionPolicy:I.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX',
     'sandboxMode:!1,autoExecutionPolicy:I.CascadeCommandsAutoExecution.EAGER'],
  ];
  for (const [o, n] of pairs) {
    if (content.includes(o)) {
      content = content.replaceAll(o, n);
      mod = true;
    }
  }
  return [content, mod];
}

function patchMcpPluginsFallback(content) {
  if (content.includes('__agMcpPluginsFallback')) return [content, false];
  let mod = false;
  content = content.replace(
    /getAvailableCascadePlugins:async\s+([A-Za-z0-9_$]+)=>f\(([A-Za-z0-9_$]+)=>\2\.getAvailableCascadePlugins\(([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+),\1\)\)\),\s*getBuildWithGooglePlugins:async\(\)=>f\(([A-Za-z0-9_$]+)=>\5\.getBuildWithGooglePlugins\(\3\(([A-Za-z0-9_$]+),\{\}\)\)\),\s*downloadBuildWithGooglePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\9\.pluginId=\7\.uid;return\s+\8\.downloadBuildWithGooglePlugin\(\9\)\}\),\s*deletePlugin:async\s+([A-Za-z0-9_$]+)=>f\(async\s+([A-Za-z0-9_$]+)=>\{var\s+([A-Za-z0-9_$]+)=\3\(([A-Za-z0-9_$]+)\);\s*\13\.pluginId=\11\.pluginId;return\s+\12\.deletePlugin\(\13\)\}\)/,
    (_, u1, v1, cfn, tAvail, u2, tBwg, u3, v3, w3, tDl, u4, v4, w4, tDel) => {
      mod = true;
      return (
        `getAvailableCascadePlugins:async ${u1}=>{try{var r=await f(${v1}=>${v1}.getAvailableCascadePlugins(${cfn}(${tAvail},${u1})));if(r&&r.plugins&&r.plugins.length>0)return r}catch(_){}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getAvailableCascadePlugins(${u1}):{plugins:[]}},` +
        `getBuildWithGooglePlugins:async()=>{try{var r=await f(${u2}=>${u2}.getBuildWithGooglePlugins(${cfn}(${tBwg},{})));if(r&&r.plugins&&r.plugins.length>0)return r}catch(_){}return window.__agMcpPluginsFallback?window.__agMcpPluginsFallback.getBuildWithGooglePlugins():{plugins:[]}},` +
        `downloadBuildWithGooglePlugin:async ${u3}=>{try{return await f(async ${v3}=>{var ${w3}=${cfn}(${tDl});${w3}.pluginId=${u3}.uid;return ${v3}.downloadBuildWithGooglePlugin(${w3})})}catch(e){if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.installPluginLocally(${u3}.uid);throw e}},` +
        `deletePlugin:async ${u4}=>{try{return await f(async ${v4}=>{var ${w4}=${cfn}(${tDel});${w4}.pluginId=${u4}.pluginId;return ${v4}.deletePlugin(${w4})})}catch(e){if(window.__agMcpPluginsFallback)return window.__agMcpPluginsFallback.removePluginLocally(${u4}.pluginId);throw e}}`
      );
    }
  );
  return [content, mod];
}

function patchVoiceModeWorklet(content) {
  if (content.includes('__agVoiceMicWorkletPatch')) return [content, false];
  let mod = false;
  const wAnc = content.indexOf('.audioWorklet.addModule("data:application/javascript;base64,"+btoa(');
  if (wAnc !== -1) {
    const ws = Math.max(0, wAnc - 40), we = Math.min(content.length, wAnc + 160);
    const wWin = content.slice(ws, we);
    const mW = /([A-Za-z0-9_$]+)\.audioWorklet\.addModule\("data:application\/javascript;base64,"\+btoa\(([A-Za-z0-9_$]+)\)\)/.exec(wWin);
    if (mW) {
      const [full, ctxVar, srcVar] = mW;
      const repl =
        `(/*__agVoiceMicWorkletPatch*/async()=>{try{return await ${ctxVar}.audioWorklet.addModule("./audio_processor.js")}catch(_a){try{var _b=URL.createObjectURL(new Blob([${srcVar}],{type:"application/javascript"}));try{return await ${ctxVar}.audioWorklet.addModule(_b)}finally{URL.revokeObjectURL(_b)}}catch(_c){return ${ctxVar}.audioWorklet.addModule("data:application/javascript;base64,"+btoa(${srcVar}))}}})()`;
      content = content.slice(0, ws + mW.index) + repl + content.slice(ws + mW.index + full.length);
      mod = true;
    }
  }
  const gAnc = content.indexOf('return navigator.mediaDevices.getUserMedia({audio:');
  if (gAnc !== -1) {
    const gs = Math.max(0, gAnc - 220), ge = Math.min(content.length, gAnc + 80);
    const gWin = content.slice(gs, ge);
    const mG = /(async function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+;try\{)(let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\(\3\);)if\(!\8\)return navigator\.mediaDevices\.getUserMedia\(\{audio:\2\}\);/.exec(gWin);
    if (mG) {
      const [full, hdr, aArg, , cArg, dVar, fVar, letG, gVar] = mG;
      const repl =
        `${hdr}try{window.Android?.cancelVoiceRecognition?.(window.__AG_NATIVE_BRIDGE_TOKEN__||"","")}catch(_){}${letG}if(!${gVar}){try{return ${fVar}(await ${dVar}(navigator.mediaDevices.getUserMedia({audio:${aArg}})))}catch(_e1){${fVar}();var _n1=_e1?.name;if(${cArg}?.()||_n1==="NotAllowedError"||_n1==="SecurityError")throw _e1;${fVar}(await ${dVar}(new Promise(_r=>{window.setTimeout(_r,150)})));if(${cArg}?.())throw _e1;try{return ${fVar}(await ${dVar}(navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0}})))}catch(_e2){${fVar}();var _n2=_e2?.name;if(${cArg}?.()||_n2==="NotAllowedError"||_n2==="SecurityError")throw _e2;return navigator.mediaDevices.getUserMedia({audio:!0})}}}`;
      content = content.slice(0, gs + mG.index) + repl + content.slice(gs + mG.index + full.length);
      mod = true;
    }
  }
  return [content, mod];
}

function patchRemoteProjectsStartup(content) {
  if (content.includes('__agRemoteStartupPatch')) return [content, false];
  let mod = false;

  const ui = content.indexOf('.experiments[');
  if (ui !== -1) {
    const us = Math.max(0, ui - 80), ue = Math.min(content.length, ui + 80);
    const uw = content.slice(us, ue);
    const m = /(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)return\(\2=\2\.experiments\[\3\]\)\?!\2\.disabled:!1\}/.exec(uw);
    if (m) {
      const [full, hdr, aVar, bVar] = m;
      const repl = `${hdr}/*__agRemoteStartupPatch*/var _x=${aVar}.experiments[${bVar}];return _x?!_x.disabled:(${bVar}==="enable-audio-transcription"||${bVar}==="enable-remote-ai"||${bVar}==="enable-github-decorator"||${bVar}==="enable-voice-relay"||${bVar}==="enable-move-conversation-to-project")}`;
      content = content.slice(0, us + m.index) + repl + content.slice(us + m.index + full.length);
      mod = true;
    }
  }

  const af = content.indexOf('.experiments;return Object.keys(');
  if (af !== -1) {
    const as = Math.max(0, af - 80), ae = Math.min(content.length, af + 120);
    const aw = content.slice(as, ae);
    const m = /(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+)\)\{var ([A-Za-z0-9_$]+)=\2\.experiments;)return Object\.keys\(\3\)\.filter\(([A-Za-z0-9_$]+)=>!\3\[\4\]\?\.disabled\)\}/.exec(aw);
    if (m) {
      const [full, hdr, , bVar, cVar] = m;
      const repl = `${hdr}var _k=Object.keys(${bVar}).filter(${cVar}=>!${bVar}[${cVar}]?.disabled);for(var _f of["enable-audio-transcription","enable-remote-ai","enable-github-decorator","enable-voice-relay","enable-move-conversation-to-project"])!${bVar}[_f]&&!_k.includes(_f)&&_k.push(_f);return _k}`;
      content = content.slice(0, as + m.index) + repl + content.slice(as + m.index + full.length);
      mod = true;
    }
  }

  const mr = content.indexOf('flagOverrideSync.retry()');
  if (mr !== -1) {
    const ms = Math.max(0, mr - 260), me = Math.min(content.length, mr + 200);
    const mw = content.slice(ms, me);
    const m = /(async function ([A-Za-z0-9_$]+)\(([A-Za-z0-9_$]+)\)\{[^}]{0,260}?if\(([A-Za-z0-9_$]+)!==void 0\)\{var [A-Za-z0-9_$]+=\3\.loaded;\3\.loaded=!0;\3\.flagOverrideSync\.retry\(\);[A-Za-z0-9_$]+&&[A-Za-z0-9_$]+\(\3\.experiments,\4\)\|\|\3\.stateProvider\.setState\(\4\))(\}(?:\}(?:finally\{[A-Za-z0-9_$]+\(\)\})?\})?)/.exec(mw);
    if (m) {
      const [full, hdr, xlaFn, aVar, fVar, tail] = m;
      const repl = `${hdr};Object.keys(${fVar}).length===0&&!${aVar}.__agMendelRetried&&(${aVar}.__agMendelRetried=!0,setTimeout(()=>{${xlaFn}(${aVar})},1500),setTimeout(()=>{${xlaFn}(${aVar})},3500))${tail}`;
      content = content.slice(0, ms + m.index) + repl + content.slice(ms + m.index + full.length);
      mod = true;
    }
  }

  const cs = content.indexOf('projectUpdatesStream({backend:2}');
  if (cs !== -1) {
    const cstart = Math.max(0, cs - 120), cend = Math.min(content.length, cs + 480);
    const cw = content.slice(cstart, cend);
    const m = /(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\)\{)([A-Za-z0-9_$]+\(\{abort:\3,createStream:[A-Za-z0-9_$]+=>\2\.lsClient\.projectUpdatesStream\(\{backend:2\},\{signal:[A-Za-z0-9_$]+\}\),onMessage:[A-Za-z0-9_$]+=>\{[A-Za-z0-9_$]+\.update\.case==="projectList"\?\(\2\.cloudProjectIds=[A-Za-z0-9_$]+\.update\.value\.projectIds,([A-Za-z0-9_$]+)\(\2\)\):[A-Za-z0-9_$]+\.update\.case==="projectUpdatedId"&&[A-Za-z0-9_$]+\(\2,[A-Za-z0-9_$]+\.update\.value\)\},onError:[A-Za-z0-9_$]+=>\{console\.warn\("\[ProjectUpdates\] Cloud stream error:",[A-Za-z0-9_$]+\)\},onDisconnect:\(\)=>\{console\.warn\("\[ProjectUpdates\] Cloud disconnected"\)\}\}\))(\})/.exec(cw);
    if (m) {
      const [full, hdr, aVar, bVar, body, u7Fn, tail] = m;
      const repl = `${hdr}${body};(async()=>{for(var _i=0;_i<5&&!${bVar}.signal.aborted;_i++){try{var _r=await ${aVar}.lsClient.listProjects({backend:2},{signal:${bVar}.signal});if(${bVar}.signal.aborted)break;if(_r?.projectIds?.length>0){if(JSON.stringify(_r.projectIds)!==JSON.stringify(${aVar}.cloudProjectIds)){${aVar}.cloudProjectIds=_r.projectIds;${u7Fn}(${aVar})}break}}catch(_){}await new Promise(_w=>setTimeout(_w,1200))}})()${tail}`;
      content = content.slice(0, cstart + m.index) + repl + content.slice(cstart + m.index + full.length);
      mod = true;
    }
  }

  const gh = content.indexOf('("github/repo").then(');
  if (gh !== -1) {
    const gs = Math.max(0, gh - 40), ge = Math.min(content.length, gh + 180);
    const gw = content.slice(gs, ge);
    const m = /(([A-Za-z0-9_$]+)\("github\/repo"\)\.then\([A-Za-z0-9_$]+=>\{([A-Za-z0-9_$]+)\.current=!0;[^}]+\}\)\.catch\(\(\)=>\{)\3\.current=!0;/.exec(gw);
    if (m) {
      const [full, hdr, , refVar] = m;
      content = content.slice(0, gs + m.index) + `${hdr}${refVar}.current=!1;` + content.slice(gs + m.index + full.length);
      mod = true;
    }
  }
  return [content, mod];
}

function patchAgentStreamResync(content) {
  if (content.includes('__agStreamResyncPatch')) return [content, false];
  const anchor = content.indexOf('"[consumeAgentStateStream] streamAgentStateUpdates error:"');
  if (anchor === -1) return [content, false];
  const ws = Math.max(0, anchor - 2500), we = Math.min(content.length, anchor + 600);
  const win = content.slice(ws, we);

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const v235Re = new RegExp(
    '(async function [A-Za-z0-9_$]+\\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)\\)\\{' +
    'var ([A-Za-z0-9_$]+)=e,([A-Za-z0-9_$]+)=e;try\\{let \\{initialStepsSlice:[^}]+\\}=[^,]+,([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\\(\\3\\),[^;]+;' +
    'for\\(;!\\5\\.signal\\.aborted;\\)\\{if\\([A-Za-z0-9_$]+\\)\\{[^}]+\\}let [A-Za-z0-9_$]+=[A-Za-z0-9_$]+\\(\\);[A-Za-z0-9_$]+\\?\\.\\([A-Za-z0-9_$]+\\);let ([A-Za-z0-9_$]+)=1E3;)' +
    '(try\\{let ([A-Za-z0-9_$]+)=[A-Za-z0-9_$]+\\([^.]+\\.StreamAgentStateUpdatesRequestSchema,\\s*\\{[^}]+\\}\\)),([A-Za-z0-9_$]+)=\\2\\(\\12,\\{signal:\\5\\.signal\\}\\);var ([A-Za-z0-9_$]+)=!1;(for await\\(let [A-Za-z0-9_$]+ of \\7\\(\\13\\)\\)\\{\\8\\(\\);try\\{)' +
    '(.*?\\[consumeAgentStateStream\\] streamAgentStateUpdates error:.*?if\\(!\\14\\)break\\})' +
    '\\5\\.signal\\.aborted\\|\\|\\8\\(await \\7\\(([A-Za-z0-9_$]+)\\(\\10,\\5\\.signal\\)\\)\\);',
    's'
  );
  let m = v235Re.exec(win);
  if (m) {
    const [full, hdr, aArg, , , dArg, , gVar, hVar, aState, iVar, reqTry, jVar, lStreamVar, kFlag, forHdr, bodyToBreak, mdaFn] = m;
    const resetM = new RegExp(`${esc(kFlag)}=!0,([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+)=0`).exec(bodyToBreak);
    const elseClause = resetM ? `else{${resetM[1]}=0;${resetM[2]}=0;${resetM[3]}=0}` : '';
    const catchRe = new RegExp(`(.*?\\})(catch\\(([A-Za-z0-9_$]+)\\)\\{${esc(hVar)}\\(\\);if\\(${esc(dArg)}\\.signal\\.aborted\\)break;${esc(kFlag)}=!0;)(.*)(if\\(!${esc(kFlag)}\\)break\\})$`, 's');
    const mc = catchRe.exec(bodyToBreak);
    if (mc) {
      const [, tryTail, catchHdr, , catchBody, catchTail] = mc;
      const setup =
        `/*__agStreamResyncPatch*/var _ac=new AbortController(),_rs=!1,_lm=Date.now(),_wh=typeof document!=="undefined"&&document.hidden,_oa=()=>{_ac.abort(${dArg}.signal.reason)},_tr=()=>{if(!_rs&&!${dArg}.signal.aborted){_rs=!0;_ac.abort("agy_stream_resync")}},_ov=()=>{if(typeof document!=="undefined"){if(document.visibilityState==="hidden")_wh=!0;else if(_wh){_wh=!1;_tr()}}},_oh=()=>{if(_wh||Date.now()-_lm>3E3)_wh=!1,_tr()};${dArg}.signal.addEventListener("abort",_oa,{once:!0});if(typeof document!=="undefined")document.addEventListener("visibilitychange",_ov);if(typeof window!=="undefined"){window.addEventListener("agy:host-resume",_oh);window.addEventListener("online",_tr)}var _wd=setInterval(()=>{if(!_rs&&!${dArg}.signal.aborted&&(${aState}.status===2||${aState}.executableStatus===2||${aState}.executorLoopStatus===2||${aState}.fullyIdle===!1)&&Date.now()-_lm>2E4)_tr()},5E3);try{`;
      const cleanup =
        `}finally{clearInterval(_wd);${dArg}.signal.removeEventListener("abort",_oa);if(typeof document!=="undefined")document.removeEventListener("visibilitychange",_ov);if(typeof window!=="undefined"){window.removeEventListener("agy:host-resume",_oh);window.removeEventListener("online",_tr)}}${dArg}.signal.aborted||${hVar}(await ${gVar}(${mdaFn}(_rs?50:${iVar},${dArg}.signal)));`;
      const repl = `${hdr}${setup}${reqTry},${lStreamVar}=${aArg}(${jVar},{signal:_ac.signal});var ${kFlag}=!1;${forHdr}_lm=Date.now();${tryTail}${catchHdr}if(!_rs){${catchBody}}${elseClause}${catchTail}${cleanup}`;
      const newWin = win.slice(0, m.index) + repl + win.slice(m.index + full.length);
      return [content.slice(0, ws) + newWin + content.slice(we), true];
    }
  }
  return [content, false];
}

function patchComposerPlusButton(content) {
  if (content.includes('__agComposerPlusPatch')) return [content, false];
  const anchor = content.indexOf('"aria-label":"Add context"');
  if (anchor === -1) return [content, false];
  const ws = Math.max(0, anchor - 300), we = Math.min(content.length, anchor + 600);
  let win = content.slice(ws, we);
  const re = /("aria-label":"Add context",\s*"data-tooltip-id":[^}]+?\},\s*[A-Za-z0-9_$]+\.createElement\([^}]+\}\)\)\),\s*[A-Za-z0-9_$]+\.createElement\([A-Za-z0-9_$]+,\{side:[^,]+,align:[^,]+,)(finalFocus:[A-Za-z0-9_$]+\?[A-Za-z0-9_$]+:void 0)(,className:)/;
  const m = re.exec(win);
  if (!m) return [content, false];
  win = win.slice(0, m.index) + `${m[1]}/*__agComposerPlusPatch*/finalFocus:!1${m[3]}` + win.slice(m.index + m[0].length);
  win = win.replace('"aria-label":"Add context"', '"type":"button","aria-label":"Add context"');
  return [content.slice(0, ws) + win + content.slice(we), true];
}

function patchConversationDragFolders(content) {
  if (content.includes('__agDragFoldersPatch')) return [content, false];
  let mod = false;

  const cfgOrig = 'moveConversationToProject:{feature:{enabled:!1}';
  if (content.includes(cfgOrig)) {
    content = content.replace(cfgOrig, 'moveConversationToProject:{/*__agDragFoldersPatch*/feature:{enabled:!0}');
    mod = true;
  }

  const t9cAnchor = content.indexOf('a.project.id!=="outside-of-project"}');
  if (t9cAnchor !== -1) {
    const ts = Math.max(0, t9cAnchor - 220), te = Math.min(content.length, t9cAnchor + 600);
    let twin = content.slice(ts, te);
    const re = /function ([A-Za-z0-9_$]+)\(a\)\{return [A-Za-z0-9_$]+\(a\)&&!a\.project\.coordinator&&a\.project\.id!=="outside-of-project"\}function ([A-Za-z0-9_$]+)\(a,b,c,d\)\{a=a&&a!=="outside-of-project"\?a:void 0;return a!==void 0\?c\.has\(a\):b\|\|d\}/;
    const m = re.exec(twin);
    if (m) {
      twin = twin.slice(0, m.index) +
        `function ${m[1]}(a){/*__agDragFoldersPatch*/return!!a?.project?.id&&!a.isPlaceholder&&!a.project.coordinator&&a.project.id!=="outside-of-project"}function ${m[2]}(a,b,c,d){a=a&&a!=="outside-of-project"?a:void 0;return a!==void 0?c.has(a):c.size>0||b||d}` +
        twin.slice(m.index + m[0].length);
      content = content.slice(0, ts) + twin + content.slice(te);
      mod = true;
    }
    const mv = content.indexOf('id:"move-to-project"');
    if (mv !== -1) {
      const mwin = content.slice(mv, Math.min(content.length, mv + 180));
      const mwinNew = mwin.replace(/([A-Za-z0-9_$]+)\("cloud"\)/, '$1("folder")');
      if (mwinNew !== mwin) {
        content = content.slice(0, mv) + mwinNew + content.slice(mv + mwin.length);
        mod = true;
      }
    }
  }

  const mRg = /if\(![A-Za-z0-9_$]+&&([A-Za-z0-9_$]+)\.type==="row"\)return ([A-Za-z0-9_$]+)\(\1\);/.exec(content);
  if (mRg) {
    content = content.slice(0, mRg.index) + `if(${mRg[1]}.type==="row")return ${mRg[2]}(${mRg[1]});` + content.slice(mRg.index + mRg[0].length);
    mod = true;
  }

  const i6cAnc = content.indexOf('dataset.testid="pointer-drag-shield"');
  if (i6cAnc !== -1) {
    const is = Math.max(0, i6cAnc - 2000), ie = Math.min(content.length, i6cAnc + 1000);
    const iwin = content.slice(is, ie);
    const i6cRe = /(w=\(0,([A-Za-z0-9_$]+)\.useRef\)\(null\),x=\(0,\2\.useCallback\)\(\(\)=>\{q\.current\?\.remove\(\);q\.current=null\},\[\]\),y=\(0,\2\.useCallback\)\(\(\)=>\s*\{r\.current&&window\.removeEventListener\("pointermove",r\.current\);u\.current&&window\.removeEventListener\("pointerup",u\.current\);v\.current&&window\.removeEventListener\("pointercancel",v\.current\);w\.current&&window\.removeEventListener\("keydown",w\.current,!0\);r\.current=null;u\.current=null;v\.current=null;w\.current=null\},\[\]\);)(.*?\},\[y,x\]\);a=\(0,\2\.useCallback\)\(\(A,\s*B\)=>\{if\(B\.button===0&&!\(p\.current\|\|B\.target\?\.closest\?\.\("\[data-no-drag\]"\)\|\|B\.target\?\.closest\?\.\('input, textarea, \[contenteditable="true"\]'\)\|\|document\.querySelector\([^)]+\)\)\)\{)y\(\);var C=n\.current,D=m\.current\.indexOf\(A\);if\(D!==-1\)\{var F=C\.getCoord\(B\),H=B\.clientX,I=B\.clientY,J=C\.threshold\?\?5,L=!1;k\.current&&\(clearTimeout\(k\.current\),k\.current=null,h\(!1\)\);B=P=>\{.*?\};var M=P=>\{.*?\};C=\(\)=>\{M\(!0\)\};var N=\(\)=>\{M\(!1\)\},O=P=>\{P\.key==="Escape"&&L&&\(P\.preventDefault\(\),P\.stopPropagation\(\),M\(!1\)\)\};r\.current=B;u\.current=C;v\.current=N;w\.current=O;window\.addEventListener\("pointermove",\s*B\);window\.addEventListener\("pointerup",C\);window\.addEventListener\("pointercancel",N\);window\.addEventListener\("keydown",O,!0\)\}\}/s;
    const mi = i6cRe.exec(iwin);
    if (mi) {
      const [full, yBlock, reactId, midAndPdHdr] = mi;
      const yNew = yBlock.replace(
        /r\.current=null;u\.current=null;v\.current=null;w\.current=null\},\[\]\);$/,
        `r.current=null;u.current=null;v.current=null;w.current=null;_tc.current?.();_tc.current=null},[]);var _tc=(0,${reactId}.useRef)(null);`
      );
      const newPdBody =
        'y();var C=n.current,D=m.current.indexOf(A);if(D!==-1){' +
        'var F=C.getCoord(B),H=B.clientX,I=B.clientY,J=C.threshold??5,L=!1,' +
        '_isT=B.pointerType==="touch",_dh=!!B.target?.closest?.("[data-agy-drag-handle]"),' +
        '_arm=!_isT||_dh,_tmr=null,_hb=!1;' +
        'k.current&&(clearTimeout(k.current),k.current=null,h(!1));' +
        'var _start=(P)=>{L=!0;p.current=!0;h(!0);' +
        'if(_isT&&!_hb){_hb=!0;try{window.Android?.performHapticFeedback?.("long_press")}catch(_){}}' +
        'document.body.style.cursor="grabbing";document.body.style.userSelect="none";x();' +
        'var R=document.createElement("div");R.dataset.testid="pointer-drag-shield";R.style.position="fixed";' +
        'R.style.inset="0";R.style.zIndex="9999";R.style.cursor="grabbing";R.style.touchAction="none";' +
        'document.body.appendChild(R);q.current=R;window.getSelection()?.removeAllRanges();' +
        'f(n.current.beginDrag({index:D,itemId:A,itemRefs:l.current,items:m.current,startCoord:F,startX:H,startY:I,event:P}))};' +
        'B=P=>{if(P.buttons===0)M(!1);else{var R=n.current.getCoord(P);' +
        'if(L)d.current!=null&&f(n.current.updateDrag(d.current,R,P));' +
        'else if(n.current.use2dThreshold?Math.max(Math.abs(P.clientX-H),Math.abs(P.clientY-I))>=J:Math.abs(R-F)>=J)_start(P)}};' +
        'var M=P=>{_tmr&&(clearTimeout(_tmr),_tmr=null);y();x();document.body.style.cursor="";document.body.style.userSelect="";' +
        'n.current.onDragEnd?.();if(L){if(P&&(P=d.current,P!=null&&(P=n.current.getReorder(P,m.current))))n.current.onReorder(P);' +
        'f(null);k.current=setTimeout(()=>{h(!1);k.current=null},100)}p.current=!1};' +
        'C=()=>{M(!0)};var N=()=>{M(!1)},O=P=>{P.key==="Escape"&&L&&(P.preventDefault(),P.stopPropagation(),M(!1))};' +
        'if(_isT){' +
        'if(!_arm){_tmr=setTimeout(()=>{_tmr=null;_arm=!0},170)}' +
        'var _tm=ev=>{var t=ev.touches?.[0];if(!t)return;' +
        'var se={clientX:t.clientX,clientY:t.clientY,buttons:1,target:ev.target,pointerType:"touch"},' +
        'dx=t.clientX-H,dy=t.clientY-I,dist=Math.hypot(dx,dy);' +
        'if(!L){if(!_arm){if(dist>9){M(!1)}return}if(dist<(_dh?2:6))return;' +
        'if(ev.cancelable)ev.preventDefault();_start(se);return}' +
        'if(ev.cancelable)ev.preventDefault();B(se)},' +
        '_te=ev=>{if(L&&ev.cancelable)ev.preventDefault();C()},' +
        '_tx=()=>{N()},' +
        '_cm=ev=>{if(!L)N();else{ev.preventDefault();ev.stopPropagation()}};' +
        '_tc.current=()=>{_tmr&&(clearTimeout(_tmr),_tmr=null);' +
        'window.removeEventListener("touchmove",_tm,{capture:!0});' +
        'window.removeEventListener("touchend",_te,{capture:!0});' +
        'window.removeEventListener("touchcancel",_tx,{capture:!0});' +
        'window.removeEventListener("contextmenu",_cm,{capture:!0})};' +
        'w.current=O;window.addEventListener("touchmove",_tm,{passive:!1,capture:!0});' +
        'window.addEventListener("touchend",_te,{passive:!1,capture:!0});' +
        'window.addEventListener("touchcancel",_tx,{capture:!0});' +
        'window.addEventListener("contextmenu",_cm,{capture:!0});window.addEventListener("keydown",O,!0)' +
        '}else{r.current=B;u.current=C;v.current=N;w.current=O;' +
        'window.addEventListener("pointermove",B);window.addEventListener("pointerup",C);window.addEventListener("pointercancel",N);window.addEventListener("keydown",O,!0)}}}' + '';
      content = content.slice(0, is + mi.index) + yNew + midAndPdHdr + newPdBody + content.slice(is + mi.index + full.length);
      mod = true;
    }
  }

  const tsAnc = content.indexOf('timestamp:b==="sidebar"?"idleOnly":"always"');
  if (tsAnc !== -1) {
    const rs = Math.max(0, tsAnc - 350), rePos = Math.min(content.length, tsAnc + 150);
    const rwin = content.slice(rs, rePos);
    const mG = /(([A-Za-z0-9_$]+)\?([A-Za-z0-9_$]+):([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{cascadeId:a,timestamp:b==="sidebar"\?"idleOnly":"always"\}\))\)\)(?=,)/.exec(rwin);
    if (mG) {
      const [full, origTs, , , rId] = mG;
      const iconM = /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),\{name:"keep"/.exec(content.slice(Math.max(0, tsAnc - 500), tsAnc));
      const iconComp = iconM ? iconM[2] : 'sx';
      const gripJsx =
        `${origTs},y&&b==="sidebar"&&!fd&&!h&&${rId}.createElement("span",{"data-agy-drag-handle":"true","aria-hidden":"true",onClick:ve=>{ve.preventDefault();ve.stopPropagation()},style:{touchAction:"none"},className:"pointer-events-auto flex items-center justify-center w-6 h-6 -my-1 -mr-1 rounded text-muted-foreground/50 active:text-foreground cursor-grab"},${rId}.createElement(${iconComp},{name:"drag_indicator",size:15}))))`;
      content = content.slice(0, rs + mG.index) + gripJsx + content.slice(rs + mG.index + full.length);
      mod = true;
    }
  }

  return [content, mod];
}

function patchMain(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  for (const fn of [
    patchAppearance,
    patchVoiceInput,
    patchOnboardingLayout,
    patchMcpPluginsFallback,
    patchVoiceModeWorklet,
    patchRemoteProjectsStartup,
    patchAgentStreamResync,
    patchComposerPlusButton,
    patchConversationDragFolders,
  ]) {
    const [next, mod] = fn(content);
    content = next;
    if (mod) changed = true;
  }
  if (changed) fs.writeFileSync(filePath, content, 'utf8');

  const ok =
    content.includes('Desktop Mode') &&
    !content.includes('AI Models & API Keys') &&
    !content.includes('Skills & Plugins Catalogue') &&
    content.includes('__agVoiceBridge') &&
    content.includes('__agMcpPluginsFallback') &&
    content.includes('__agVoiceMicWorkletPatch') &&
    content.includes('__agRemoteStartupPatch') &&
    content.includes('__agStreamResyncPatch') &&
    content.includes('__agComposerPlusPatch') &&
    content.includes('__agDragFoldersPatch') &&
    content.includes('_isT=B.pointerType') &&
    content.includes('data-agy-drag-handle');
  if (!ok) {
    throw new Error('Verification failed: missing expected markers or unwanted entries in patched main.js');
  }
  console.log('[web-patch] Successfully patched main.js via node');
}

const target = process.argv[2] || path.join(__dirname, 'main.js');
patchMain(target);
