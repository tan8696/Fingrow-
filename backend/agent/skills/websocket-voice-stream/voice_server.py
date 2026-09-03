import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Router for the voice skill, can be included in main.py
router = APIRouter()

# ---------------------------------------------------------------------------
# Mock Integrations (Sarvam AI / Bhashini)
# ---------------------------------------------------------------------------
async def mock_stt_api(audio_chunk: bytes) -> str:
    """
    Mock Regional Speech-to-Text (STT) integration.
    Simulates sending binary audio frames to an external API like Sarvam AI or Bhashini
    and returning the transcribed text.
    """
    await asyncio.sleep(0.5)  # Simulate network latency
    
    # In a real scenario, we'd accumulate chunks or use a streaming STT API.
    # For now, we mock a response that might trigger "Voice Surfing".
    return "Please open the scheme calculator for me."

async def process_llm_business_logic(transcript: str) -> str:
    """
    Mock Business Logic.
    Passes the transcribed text to our existing LLM business logic to generate a response.
    """
    await asyncio.sleep(0.2)
    return "Certainly! Opening the scheme calculator now. Let's analyze your eligibility."

async def mock_tts_api(text: str) -> bytes:
    """
    Mock Regional Text-to-Speech (TTS) integration.
    Simulates sending LLM text response to an external TTS API and receiving audio bytes.
    """
    await asyncio.sleep(0.5)
    # Return a dummy silent wav/webm audio blob to satisfy the frontend WebSocket
    # A real implementation would stream the actual generated audio bytes.
    return b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"


# ---------------------------------------------------------------------------
# WebSocket Endpoint
# ---------------------------------------------------------------------------
@router.websocket("/ws/voice")
async def websocket_voice_endpoint(websocket: WebSocket):
    """
    Accepts incoming binary audio frames from the React frontend,
    transcribes them, runs LLM logic, and sends back both text and audio.
    """
    await websocket.accept()
    logger.info("New WebSocket connection established on /ws/voice")
    
    try:
        while True:
            # Receive binary audio frames from the frontend MediaRecorder
            audio_data = await websocket.receive_bytes()
            logger.info(f"Received audio frame of size: {len(audio_data)} bytes")
            
            # Step 1: Speech-to-Text (STT)
            transcript = await mock_stt_api(audio_data)
            
            # Send the transcript back to frontend immediately for Voice Surfing navigation
            await websocket.send_text(json.dumps({"transcript": transcript}))
            
            # Step 2: LLM Business Logic
            llm_response = await process_llm_business_logic(transcript)
            
            # Step 3: Text-to-Speech (TTS)
            tts_audio = await mock_tts_api(llm_response)
            
            # Send the resulting audio blob back to the frontend for playback
            await websocket.send_bytes(tts_audio)
            
    except WebSocketDisconnect:
        logger.info("WebSocket connection disconnected by client")
    except Exception as e:
        logger.error(f"Error in websocket stream: {e}")
