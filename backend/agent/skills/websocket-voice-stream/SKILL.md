---
name: websocket-voice-stream
description: Provides a FastAPI WebSocket endpoint to handle binary audio streaming, regional STT/TTS (e.g., Sarvam AI / Bhashini), and LLM integration for Voice Surfing.
---

# WebSocket Voice Stream Skill

This skill provides a high-performance WebSocket endpoint (`/ws/voice`) built with FastAPI to facilitate **Voice Surfing** in the frontend. 

It handles bidirectional, real-time streams of audio bytes and text transcripts.

## How it Works
1. **Audio Ingestion**: The React frontend records microphone audio in chunks (via `MediaRecorder`) and sends them over the WebSocket as `bytes`.
2. **Speech-to-Text (STT)**: The `voice_server.py` processes the audio frames, mocking integration with regional STT APIs (e.g., Bhashini or Sarvam AI) to translate and transcribe the audio into English text.
3. **Voice Surfing Broadcast**: The transcribed text is immediately serialized into JSON (`{"transcript": "..."}`) and pushed back to the frontend. The frontend React app catches this text and parses it for navigation keywords (like "calculator" or "report"), triggering instantaneous UI state changes.
4. **LLM Business Logic**: The transcript is concurrently sent to our core business logic engines to generate a smart textual response.
5. **Text-to-Speech (TTS)**: The LLM's response is sent to a mocked TTS API. The resulting audio `bytes` are pushed down the WebSocket to the frontend, which wraps it in a `Blob` and plays it automatically for the user.

## Requirements
- Python 3.9+
- `fastapi` and `uvicorn`
- Proper WebSocket support configured in the React UI (e.g., connecting to `ws://localhost:8000/ws/voice`).
