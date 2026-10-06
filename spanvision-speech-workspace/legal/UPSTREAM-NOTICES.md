# Open-source notices

Speech Workspace is a modified distribution of Open Speech Studio v0.12.0,
originally developed by OpenAEC Foundation.

Original displayed copyright notice:
© 2026 OpenAEC Foundation. All rights reserved.

Upstream source: https://github.com/OpenAEC-Foundation/open-speech-studio
Application source license: Apache License 2.0; see the accompanying LICENSE.

Spanvision Infra changes include identity, grayscale themes, responsive UI,
local-only service configuration, migration, and browser previews.
This edition does not imply endorsement by the original authors.

The bundled Whisper engine, GGML models, CUDA/runtime libraries, optional Piper
voices and engines, and other dependencies retain their respective licenses.
Their technical names and resource filenames remain intact for compatibility.

This edition adds the official Windows x64 CPU build of whisper.cpp v1.8.3
alongside the retained CUDA build, for systems without an NVIDIA driver.
Source: https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.3
Archive SHA-256: d824b1e37599f882b396e73f1ee0bfd5d0529f700314c48311dcbd00b803321d
Copyright (c) 2023-2024 The ggml authors. MIT license; the complete license is
included in WHISPER-CPU-LICENSE.txt. Engine provenance is in bin/cpu/PROVENANCE.json.

Browser transcription uses Hugging Face Transformers.js 4.3.0 (Apache-2.0).
Its complete license is included in -huggingface-transformers-LICENSE.txt.
ONNX Runtime Web is distributed under the MIT license.
https://github.com/microsoft/onnxruntime/blob/main/LICENSE
The English ONNX model is onnx-community/whisper-tiny.en, converted from
OpenAI Whisper tiny.en. Model downloads occur on first use and are cached by
the browser; recordings are processed locally, not sent for remote inference.
https://huggingface.co/onnx-community/whisper-tiny.en
https://github.com/openai/whisper/blob/main/LICENSE
