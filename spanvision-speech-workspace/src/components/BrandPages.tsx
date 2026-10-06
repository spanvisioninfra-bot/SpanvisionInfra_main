import { createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import brand from "../brand.json";
import { runtime } from "../lib/runtime";
import { readLocalProfile, saveLocalProfile } from "../../../branding/local-profile.js";

export const SAMPLE="The site review is scheduled for Thursday at nine. Please bring the revised foundation drawings and confirm the access route before the meeting. We will record the decisions and share the final notes with the project team.";
const [profile,setProfile]=createSignal(readLocalProfile());
function Arrow(){return <span aria-hidden="true">↗</span>;}
function Waveform(){const levels=[8,12,22,15,35,48,25,57,74,40,90,58,32,65,97,70,44,83,60,35,20,45,73,98,61,35,68,89,46,72,55,28,45,70,38,52,75,41,26,60,83,53,36,67,90,59,40,24,48,31,62,43,29,15,24,13];return <div class="sample-waveform" aria-hidden="true"><For each={levels}>{height=><i style={{height:`${height}%`}}/>}</For></div>;}

export function PreviewWorkspace(props:{text:string;onChange:(text:string)=>void}){
  const [message,setMessage]=createSignal("");
  return <section class="preview-workspace"><div class="page-heading"><div><span class="eyebrow">YOUR WORDS, IN FOCUS</span><h1>Speech workspace</h1></div><span class="small-label">Transcript</span></div>
    <Show when={props.text} fallback={<div class="empty-state"><div class="empty-icon">SW</div><h2>Ready for your next idea.</h2><p>Explore a sample transcript, or open the desktop app to dictate with a local model.</p><button class="btn btn-primary btn-large" onClick={()=>props.onChange(SAMPLE)}>Load sample transcript <Arrow/></button><a class="text-link" href="#transcribe">Import audio</a></div>}>
      <div class="sample-session"><span class="small-label">YOUR TRANSCRIPT</span><div class="sample-session-meta"><span>English</span></div></div>
      <div class="transcript-toolbar"><span>TRANSCRIPT</span><div><button class="btn btn-small" onClick={async()=>{try{await navigator.clipboard.writeText(props.text);setMessage("Transcript copied.");}catch{setMessage("Select the transcript and copy it manually.");}}}>Copy</button><button class="btn btn-small" onClick={()=>{const url=URL.createObjectURL(new Blob([props.text],{type:"text/plain"}));const link=document.createElement("a");link.href=url;link.download="speech-workspace-transcript.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Transcript exported.");}}>Export text</button><button class="btn btn-small" onClick={()=>props.onChange("")}>Clear</button></div></div>
      <textarea class="sample-transcript" aria-label="Edit transcript" value={props.text} onInput={e=>props.onChange(e.currentTarget.value)}/><p class="small-label">Edit your words. Copy or export when you are ready.</p>
    </Show><Show when={message()}><p role="status" class="form-message">{message()}</p></Show>
  </section>;
}

export function AudioImport(props:{onSample:(text:string)=>void;compact?:boolean}) {
  const [file,setFile]=createSignal<File|null>(null);
  const [state,setState]=createSignal<"ready"|"processing"|"complete">("ready");
  const [status,setStatus]=createSignal(""); const [error,setError]=createSignal("");
  const [text,setText]=createSignal("");
  let dialog!:HTMLDialogElement, controller:AbortController|undefined, previousFocus:HTMLElement|null=null;
  const clear=()=>{controller?.abort();controller=undefined;};
  const close=()=>{clear();dialog.close();previousFocus?.focus();};
  const open=(event:MouseEvent)=>{previousFocus=event.currentTarget as HTMLElement;setState("ready");setError("");dialog.showModal();};
  const start=async()=>{
    clear();setError("");setText("");
    if(!file()){setError("Choose a recording first.");return;}
    const active=controller=new AbortController();setState("processing");
    try {
      const {transcribeAudioFile}=await import("../lib/browser-transcription");
      const transcript=await transcribeAudioFile(file()!,active.signal,setStatus);
      if(active.signal.aborted)return;
      setText(transcript);setState("complete");
    } catch(error) {
      if(active.signal.aborted)return;
      setError(error instanceof Error?error.message:"Transcription failed.");setState("ready");
    } finally {if(controller===active)controller=undefined;}
  };
  onCleanup(clear);
  return <>
    <Show when={!props.compact}><div class="page-heading"><div><span class="eyebrow">FROM AUDIO TO ACTION</span><h1>Audio import</h1><p>Transcribe a recording on this device.</p></div></div><div class="audio-import-card"><span class="import-glyph" aria-hidden="true">↥</span><h2>A clearer record.</h2><p>WAV, MP3, and audio formats your browser can decode.<br/>English recordings up to 10 minutes and 50 MB.</p><button class="btn btn-primary" onClick={open}>Import audio <Arrow/></button><span class="small-label">Local recognition · no audio upload</span></div></Show>
    <Show when={props.compact}><button class="btn btn-outline" onClick={open}>Import audio <Arrow/></button></Show>
    <dialog ref={dialog} class="speech-dialog" aria-labelledby="audio-import-title" onCancel={event=>{event.preventDefault();close();}}>
      <div class="dialog-heading"><div><span class="eyebrow">SPEECH WORKSPACE</span><h2 id="audio-import-title">Transcribe audio</h2></div><button class="btn icon-button" aria-label="Close audio import" onClick={close}>×</button></div>
      <p>Recognition runs in your browser. The first use downloads the English speech model. Your recording is not uploaded. Review the resulting text for accuracy.</p>
      <Show when={state()==="ready"}><label class="file-picker">Choose audio<input type="file" accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg,.webm" onChange={event=>{setFile(event.currentTarget.files?.[0]??null);setError("");}}/></label><div class="selected-file">{file()?.name||"Choose a recording"}</div></Show>
      <Show when={state()==="processing"}><div role="status">{status()}</div><progress aria-label="Transcription progress"/></Show>
      <Show when={state()==="complete"}><p role="status">Transcription complete. Review the text before using it.</p><div class="sample-excerpt">{text()||"No speech was detected. Try a clearer recording."}</div></Show>
      <Show when={error()}><p role="alert" class="form-message">{error()}</p></Show>
      <div class="dialog-actions"><button class="btn btn-outline" onClick={close}>{state()==="complete"?"Close":"Cancel"}</button><Show when={state()==="ready"}><button class="btn btn-primary" onClick={start}>Transcribe recording</button></Show><Show when={state()==="complete"&&text()}><button class="btn btn-primary" onClick={()=>{close();props.onSample(text());}}>Open transcript <Arrow/></button></Show></div>
    </dialog>
  </>;
}

export default function BrandPages(props:{view:string;navigate:(value:string)=>void;onSample:(text:string)=>void}){
  const [error,setError]=createSignal("");const [success,setSuccess]=createSignal("");
  createEffect(()=>{props.view;setError("");setSuccess("");});
  const suggestions=[{number:"01",title:"Capture the thought.",text:"Dictate a site note while the detail is still fresh.",route:"home",label:"Open speech workspace"},{number:"02",title:"Keep every decision.",text:"Review the meeting workflow for microphone and system audio.",route:"meeting",label:"Explore meetings"},{number:"03",title:"Give recordings a voice.",text:"Import audio and refine the words in your transcript workspace.",route:"transcribe",label:"Import audio"}];
  return <>
    <Show when={props.view==="landing"}><div class="speech-landing"><nav class="landing-nav" aria-label="Speech workspace links"><a href="#workspace">Workspace</a><a href="#suggestions">Suggestions</a><a href="#about">About</a><a href="#account">Local profile</a></nav>
      <section class="speech-hero"><span class="eyebrow"><i class="mono-dot"/> SPANVISION INFRA / SPEECH TOOLS</span><h1>Your voice.<br/>A clearer<br class="mobile-break"/> workspace<span>.</span></h1><div class="hero-bottom"><p>Ideas, recordings, and decisions.<br/>Bring your words into focus.</p><div class="hero-actions"><a class="btn btn-primary" href="#workspace">Open workspace <Arrow/></a><AudioImport compact onSample={props.onSample}/><span class="small-label">Local speech. Familiar workflows. No account needed.</span></div></div>
      <a class="landing-transcript" href="#workspace" aria-label="Explore the speech workspace"><div class="transcript-window-bar"><span><img src="/sw-mark.svg" alt=""/> {brand.product}</span><span>SITE BRIEFING / SAMPLE</span></div><div class="landing-wave"><Waveform/><div><span>00:18</span><span>SAMPLE TRANSCRIPT</span></div></div><p>“Please bring the revised foundation drawings and confirm the access route before the meeting.”</p><footer><span>DICTATE · TRANSCRIBE · REFINE</span><Arrow/></footer></a><div class="hero-caption"><span>YOUR WORDS. ON YOUR COMPUTER.</span><span>SPEECH / MEETINGS / RECORDINGS</span></div></section>
      <section class="speech-features"><div><span class="eyebrow">BUILT FOR THE WAY YOU WORK</span><h2>Speak naturally.<br/>Work clearly.</h2></div><div><For each={suggestions}>{item=><a href={`#${item.route==="home"?"workspace":item.route}`}><span>/{item.number}</span><h3>{item.title}</h3><p>{item.text}</p><Arrow/></a>}</For></div></section>
      <section class="speech-photo"><img src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=85" alt="Business workspace with naturally colored desks and greenery" loading="lazy"/><div><span class="eyebrow">MADE FOR REAL PROJECTS</span><h2>Keep the detail.<br/>Clear the noise.</h2><p>Capture site notes, project meetings, and the ideas that connect them. Your desktop app processes speech locally with models you control.</p><a class="btn btn-outline" href="#suggestions">Find your next step <Arrow/></a></div></section><footer class="landing-footer"><span>{brand.organization} / {brand.product}</span><a href="#about">About & open-source notices</a></footer>
    </div></Show>
    <Show when={props.view==="suggestions"}><section class="speech-page"><span class="eyebrow">A BETTER NEXT STEP</span><h1>Start with your voice.</h1><p>Choose the workflow that fits the moment.</p><div class="suggestion-grid"><For each={suggestions}>{item=><article><span class="eyebrow">/{item.number}</span><h2>{item.title}</h2><p>{item.text}</p><a class="btn btn-outline" href={`#${item.route==="home"?"workspace":item.route}`}>{item.label} <Arrow/></a></article>}</For></div><p class="small-label">{runtime.preview?"Transcribe uploaded recordings locally in your browser. Microphone and voice workflows use the desktop app.":"Local tools. No account required."}</p></section></Show>
    <Show when={props.view==="account"}><section class="speech-page"><span class="eyebrow">YOUR SPACE / LOCAL PROFILE</span><h1>Your local profile.</h1><p>Your display name saves in this browser. No sign-in is required.</p><form class="profile-form" onSubmit={event=>{event.preventDefault();setError("");setSuccess("");try {setProfile(saveLocalProfile(new FormData(event.currentTarget).get("name")));setSuccess("Profile saved in this browser.");}catch(error){setError(error instanceof Error?error.message:"Could not save this profile.");}}}><div class="profile-avatar">{profile().name.charAt(0).toUpperCase()||"SI"}</div><label>Display name<input name="name" value={profile().name} maxLength={80} autocomplete="name" placeholder="Your name"/></label><div class="profile-detail"><span>Speech processing</span><span>Local desktop · no subscription required</span></div><button class="btn btn-primary" type="submit">Save profile <Arrow/></button><Show when={error()}><p class="form-message" role="alert">{error()}</p></Show><Show when={success()}><p class="form-message" role="status">{success()}</p></Show></form><a class="text-link" href="#workspace">Open speech workspace <Arrow/></a></section></Show>
  </>;
}
