import { createSignal, Show } from "solid-js";
import brand from "../brand.json";
import notices from "../../legal/UPSTREAM-NOTICES.md?raw";
import license from "../../LICENSE?raw";
import cpuLicense from "../../legal/WHISPER-CPU-LICENSE.txt?raw";
import transformersLicense from "../../legal/-huggingface-transformers-LICENSE.txt?raw";
import onnxLicense from "../../legal/ONNX-RUNTIME-LICENSE.txt?raw";
import modelLicense from "../../legal/WHISPER-MODEL-LICENSE.txt?raw";
export default function About() {
  const [showNotices,setShowNotices]=createSignal(false);
  return <div class="about-page"><div class="about-header"><img src="/sw-mark.svg" alt="SW" width="64" height="64"/><div><h2>{brand.product}</h2><span class="about-version">v{brand.version}</span></div></div>
    <p class="about-description">Local speech tools for dictation, recordings, meetings, and text-to-speech. A focused workspace by {brand.organization}.</p>
    <div class="about-section"><div class="about-row"><span class="about-label">Organization</span><span>{brand.organization}</span></div><div class="about-row"><span class="about-label">License</span><span>Apache-2.0</span></div><div class="about-row"><span class="about-label">Interface</span><span>Spanvision Mono · SW</span></div></div>
    <button class="btn" aria-expanded={showNotices()} onClick={()=>setShowNotices(!showNotices())}>Open-source notices</button>
    <Show when={showNotices()}><section class="legal-notices" aria-label="Open-source notices"><pre>{notices}</pre><details><summary>Apache License 2.0</summary><pre>{license}</pre></details><details><summary>Whisper CPU engine · MIT License</summary><pre>{cpuLicense}</pre></details><details><summary>Transformers.js · Apache License 2.0</summary><pre>{transformersLicense}</pre></details><details><summary>ONNX Runtime · MIT License</summary><pre>{onnxLicense}</pre></details><details><summary>Whisper model · MIT License</summary><pre>{modelLicense}</pre></details></section></Show>
    <p class="about-copyright">{brand.organization} · workspace edition</p>
  </div>;
}
