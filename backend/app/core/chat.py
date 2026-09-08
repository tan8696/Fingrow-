"""
LLM Chat Engine — Groq-Powered Conversational Assistant
========================================================
Handles free-form user queries via Groq LLM with:
  - Multilingual support (English, Hindi, Marathi)
  - Navigation intent detection (returns navigate_to field)
  - Conversation history for contextual replies
  - Graceful fallback when the API is unavailable
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from groq import Groq

logger = logging.getLogger(__name__)

# Model preferences — try the faster model first, fall back to smaller if unavailable
CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")
CHAT_MODEL_FALLBACK = "llama-3.1-8b-instant"

# Valid navigation targets in the FinGrow app
VALID_NAV_TARGETS = [
    "dashboard", "feasibility", "history", "market",
    "weather", "settings", "calculator",
]

# System prompt for the conversational assistant
SYSTEM_PROMPT = """\
You are FinGrow AI Assistant — a knowledgeable, friendly, and multilingual \
conversational assistant built into the FinGrow rural enterprise advisory platform.

YOUR ROLE:
- Help rural Indian farmers and micro-entrepreneurs with questions about \
agriculture, government schemes, subsidies, loans, crop management, weather, \
market prices, livestock, poultry, dairy, insurance, and financial planning.
- You can answer GENERAL knowledge questions too — you are a helpful assistant, \
not limited to only agriculture topics.
- You are conversational, warm, and speak simply (avoid complex jargon).

NAVIGATION:
The FinGrow app has these pages the user can navigate to:
- "dashboard" — Main dashboard with portfolio overview, KPIs, and quick actions
- "feasibility" — Business feasibility reports with SWOT analysis and market intelligence
- "history" — Loan management, EMI tracking, repayment history
- "market" — Live APMC mandi prices for crops (soybean, cotton, wheat, etc.)
- "weather" — Weather forecast, crop risk alerts, insurance, spray protocols
- "settings" — App settings, language preferences, profile
- "calculator" — Scheme calculator for subsidy and loan eligibility

If the user asks to go to, open, show, or navigate to any of these pages, \
include it in your response.

LANGUAGE:
- Respond in the SAME language the user is writing/speaking in.
- If the user writes in Hindi, reply in Hindi. If in Marathi, reply in Marathi.
- If the system says the language is "hi", respond in Hindi. If "mr", respond in Marathi.
- Keep responses concise (2-4 sentences for simple questions, more for detailed ones).

RESPONSE FORMAT:
You MUST respond with a valid JSON object with these fields:
{
  "reply": "Your conversational response text here",
  "navigate_to": null or one of ["dashboard", "feasibility", "history", "market", "weather", "settings", "calculator"],
  "suggestions": ["Suggested follow-up question 1", "Suggested follow-up question 2"]
}

RULES:
1. Always return valid JSON — no markdown fences, no extra text.
2. Set "navigate_to" ONLY when the user explicitly asks to go to / open / show a page.
3. Keep "suggestions" to 2-3 short follow-up questions relevant to the conversation.
4. If you navigate somewhere, mention it naturally in your reply (e.g., "Opening the weather page for you...").
5. Never make up financial numbers — if you don't know exact current rates, say so.
6. Be helpful, accurate, and empathetic to rural users.
"""

LANGUAGE_INSTRUCTIONS = {
    "hi": "\n\nIMPORTANT: The user's preferred language is Hindi (हिन्दी). "
          "You MUST respond in Hindi using Devanagari script. "
          "Keep suggestions in Hindi too.",
    "mr": "\n\nIMPORTANT: The user's preferred language is Marathi (मराठी). "
          "You MUST respond in Marathi using Devanagari script. "
          "Keep suggestions in Marathi too.",
    "en": "",
}


def _get_groq_client() -> Groq:
    """Get a Groq client using the existing GROQ_API_KEY."""
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY environment variable is not set.")
    return Groq(api_key=api_key)


def _build_messages(
    user_message: str,
    history: List[Dict[str, str]],
    language: str,
    current_view: str,
) -> List[Dict[str, str]]:
    """Build the messages array for the Groq API call."""
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(language, "")
    context_note = f"\n\nCONTEXT: The user is currently viewing the '{current_view}' page."

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT + lang_instruction + context_note,
        }
    ]

    # Add conversation history (last 10 messages max)
    for msg in history[-10:]:
        role = "user" if msg.get("role") == "user" else "assistant"
        content = msg.get("text") or msg.get("content", "")
        if content:
            if role == "assistant":
                # Wrap previous assistant messages as JSON for consistency
                messages.append({
                    "role": "assistant",
                    "content": json.dumps({"reply": content, "navigate_to": None, "suggestions": []}),
                })
            else:
                messages.append({"role": "user", "content": content})

    # Add the current user message
    messages.append({"role": "user", "content": user_message})
    return messages


def _parse_response(raw_text: str) -> Dict[str, Any]:
    """Parse and validate the LLM response JSON."""
    # Strip markdown fences if present
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (fences)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)

    parsed = json.loads(text)

    # Validate and sanitize
    result = {
        "reply": str(parsed.get("reply", "I'm here to help! Could you rephrase your question?")),
        "navigate_to": None,
        "suggestions": [],
    }

    nav = parsed.get("navigate_to")
    if nav and isinstance(nav, str) and nav.lower() in VALID_NAV_TARGETS:
        result["navigate_to"] = nav.lower()

    suggestions = parsed.get("suggestions", [])
    if isinstance(suggestions, list):
        result["suggestions"] = [str(s) for s in suggestions[:3]]

    return result


def chat(
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: str = "en",
    current_view: str = "dashboard",
) -> Dict[str, Any]:
    """
    Send a chat message and get a conversational response from Groq.

    Args:
        message:      The user's message text.
        history:      Previous conversation messages [{role, text}, ...].
        language:     Language code ('en', 'hi', 'mr').
        current_view: Which page the user is currently on.

    Returns:
        Dict with keys: reply (str), navigate_to (str|None), suggestions (list).

    Raises:
        EnvironmentError: If GROQ_API_KEY is not set.
        ValueError:       If LLM returns unparseable response after retry.
    """
    if not message or not message.strip():
        return {
            "reply": "Please ask me a question or tell me what you'd like to do!",
            "navigate_to": None,
            "suggestions": [],
        }

    client = _get_groq_client()
    messages = _build_messages(message, history or [], language, current_view)

    def _call_and_parse(model: str) -> Dict[str, Any]:
        response = client.chat.completions.create(
            messages=messages,
            model=model,
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=1024,
        )
        raw = response.choices[0].message.content.strip()
        return _parse_response(raw)

    # Try primary model
    try:
        logger.info(f"Chat request [{language}]: {message[:80]}...")
        return _call_and_parse(CHAT_MODEL)
    except json.JSONDecodeError as e:
        logger.warning(f"Primary model JSON parse failed: {e}. Retrying with fallback model.")
    except Exception as e:
        logger.warning(f"Primary model ({CHAT_MODEL}) failed: {e}. Trying fallback.")

    # Try fallback model
    try:
        return _call_and_parse(CHAT_MODEL_FALLBACK)
    except json.JSONDecodeError as e:
        logger.error(f"Fallback model JSON parse also failed: {e}")
        raise ValueError(f"LLM returned invalid JSON: {e}")
    except Exception as e:
        logger.error(f"Fallback model also failed: {e}")
        raise
