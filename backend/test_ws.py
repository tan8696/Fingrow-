import asyncio
import websockets
import json

async def test_voice_ws():
    uri = "ws://localhost:8000/ws/voice"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket")
            
            # 1. Send dummy audio data
            dummy_audio = b"\x00\x01\x02\x03"
            print("Sending dummy audio data...")
            await websocket.send(dummy_audio)
            
            # 2. Wait for transcript
            print("Waiting for transcript...")
            response1 = await websocket.recv()
            print(f"Received (Text): {response1}")
            assert json.loads(response1)["transcript"] == "Please open the scheme calculator for me."
            
            # 3. Wait for audio blob
            print("Waiting for TTS audio...")
            response2 = await websocket.recv()
            print(f"Received (Binary): {len(response2)} bytes")
            assert isinstance(response2, bytes)
            
            print("Test passed successfully!")
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_voice_ws())
