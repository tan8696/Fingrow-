# 🌾 FinGrow Advisory: How Everything Works (Explained Like You're 5 Years Old!)

> Welcome, little friend! Imagine you want to set up the best organic egg and milk stand in your village. But you don't have enough pocket money to buy the hens and the cows, and you don't know if the shopkeeper down the dirt road is already selling them! 
> 
> That's where **FinGrow Advisory** comes in. It's like having a **super-smart financial superhero robot** that looks at your village on a magic map, counts the nearby shops, counts your coins, talks to the big bank for you, and even speaks in your own language!
> 
> Let's take a journey inside the machine and see how all the pieces, gears, and code work together!

---

## 📑 Table of Contents
1. [The Big Picture: What Are We Building?](#1-the-big-picture-what-are-we-building)
2. [The Two Kingdoms: Frontend & Backend](#2-the-two-kingdoms-frontend--backend)
3. [The Money Magic: The Financial Engine](#3-the-money-magic-the-financial-engine)
   - [The 10% Piggy Bank Rule](#the-10-piggy-bank-rule-margin-capital)
   - [Micro Finance vs Term Loan (Which Box Do You Belong In?)](#micro-finance-vs-term-loan)
   - [The "Nap Time" Before Paying (Moratorium)](#the-nap-time-before-paying-moratorium)
   - [The Sinking Ice Cream Cone (Reducing Balance EMI)](#the-sinking-ice-cream-cone-reducing-balance-emi)
   - [The Government Gift (Capital Subsidy)](#the-government-gift-capital-subsidy)
4. [The Magic Map & Competitor Radar: Geocoding & OpenStreetMap](#4-the-magic-map--competitor-radar-geocoding--openstreetmap)
   - [Finding the Village (Nominatim Geocoding)](#finding-the-village-nominatim-geocoding)
   - [The Competitor Radar (Overpass API)](#the-competitor-radar-overpass-api)
   - [The Secret Safety Net (Fallback Locations)](#the-secret-safety-net-fallback-locations)
5. [The AI Brain with Seatbelts: Groq LLM Advisory](#5-the-ai-brain-with-seatbelts-groq-llm-advisory)
   - [Why the AI Isn't Allowed to Make Up Fairy Tales](#why-the-ai-isnt-allowed-to-make-up-fairy-tales)
   - [The Market Viability Score (90% Green Circle)](#the-market-viability-score)
   - [The SWOT Mystery Box](#the-swot-mystery-box)
6. [The Talking Helper & Polyglot Parrot: Voice & Languages](#6-the-talking-helper--polyglot-parrot-voice--languages)
   - [Talking with Your Voice (Web Speech API)](#talking-with-your-voice)
   - [The Polyglot Parrot (`react-i18next`)](#the-polyglot-parrot-react-i18next)
7. [The Journey of a Click: Step-by-Step Data Flow](#7-the-journey-of-a-click-step-by-step-data-flow)
8. [The Emergency Cushions: Why the App Never Crashes](#8-the-emergency-cushions-why-the-app-never-crashes)
9. [The Big Cheat-Sheet (Summary of Formulas & Files)](#9-the-big-cheat-sheet)

---

## 1. The Big Picture: What Are We Building?

Imagine a farmer named **Ramesh** who lives in a village in Vidarbha, Maharashtra. Ramesh has ₹50,000 in his piggy bank. He wants to start an **Organic Poultry Farm**. 

Ramesh has three big problems:
1. **He doesn't know how big of a farm he can build** with his ₹50,000.
2. **He doesn't know if the government bank will lend him money**, or what interest rate they will charge.
3. **He doesn't know if 10 other people in his village are already selling eggs**. If everyone is selling eggs, nobody will buy his!
4. **He prefers Marathi or Hindi**, and traditional banking forms are full of confusing English words.

**FinGrow Advisory** solves all four problems in under **5 seconds**:
- It looks at his ₹50,000 and calculates: *"You can build a ₹5,00,000 farm! You give 10%, the bank gives you 90% (₹4,50,000) at 7% interest!"*
- It shoots a radar beam onto a real satellite map of his village and counts how many chicken farms exist nearby.
- A friendly robot brain writes him a complete, bank-ready **Feasibility Report** with charts, monthly payment schedules, and risk tips.
- It lets him listen, speak, and read in **English**, **मराठी**, or **हिन्दी**.

---

## 2. The Two Kingdoms: Frontend & Backend

Our project is split into two best friends who talk to each other over a walkie-talkie:

```
+-------------------------------------------------------------+
|                     THE FRONTEND (React)                   |
|  The pretty face you see on your screen (buttons, sliders,  |
|  colors, voice mic, and charts). Built with Vite & Tailwind!|
+-------------------------------------------------------------+
                              |
                     Walkie-Talkie (HTTP /api)
                              |
                              v
+-------------------------------------------------------------+
|                     THE BACKEND (FastAPI)                  |
|  The secret underground kitchen. It has the math calculator,|
|  the satellite map connectors, and the AI brain (Groq).     |
+-------------------------------------------------------------+
```

### The Frontend (`/frontend`)
- **What it is**: The toy you hold in your hands. It runs right in your web browser (Chrome/Edge/Safari).
- **Files to know**:
  - `src/components/Dashboard.jsx`: The main control room.
  - `src/components/SchemeCalculator.jsx` & `ScenarioCalculator.jsx`: The interactive sliders where you play with numbers.
  - `src/components/MarketReport.jsx`: The colorful report screen with the 90% circle score and pie charts.
  - `src/components/FloatingVoiceAgent.jsx`: The floating microphone button you can talk to.
  - `src/locales/`: The language dictionaries (`en.json`, `hi.json`, `mr.json`).

### The Backend (`/backend`)
- **What it is**: The kitchen where the food is cooked. It runs with Python using a fast engine called **FastAPI**.
- **Files to know**:
  - `app/core/calculator.py`: The strict math rules (no guessing allowed!).
  - `app/core/loan_schedule.py`: Builds the month-by-month payment calendar.
  - `app/core/geocoder.py`: Finds villages on the globe.
  - `app/core/osm_fetcher.py`: Counts competitors using OpenStreetMap.
  - `app/core/advisory.py`: Asks the Groq AI brain to write business advice.
  - `app/api/routes.py`: The waiter who takes requests from the frontend and brings back reports.

---

## 3. The Money Magic: The Financial Engine

Banks have very strict rules. If you guess, you go to time-out! 
In `backend/app/core/calculator.py`, **we do NOT let the AI do math**. AI can hallucinate that 2 + 2 = 5! 
Instead, we use pure, deterministic Python arithmetic.

### The 10% Piggy Bank Rule (Margin Capital)
Under government agricultural schemes (like NABARD and Maharashtra's Agri initiatives), the entrepreneur must provide **10% of their own money** (called *Margin Contribution*). The bank finances the remaining **90%**.

Imagine you want a ₹100 toy truck:
- You put in ₹10 of your pocket money.
- Your dad (the bank) gives you ₹90.

So if Ramesh brings **₹50,000**:
$$\text{Total Project Cost} = \frac{\text{Ramesh's Money}}{0.10} = \frac{50,000}{0.10} = ₹5,00,000$$
$$\text{Bank Loan Amount} = \text{Project Cost} \times 0.90 = 5,00,000 \times 0.90 = ₹4,50,000$$

### Micro Finance vs Term Loan
Which government scheme does Ramesh qualify for? We have two boxes:

| Scheme Name | When do you get it? | Interest Rate | Repayment Time | Grace Period |
| :--- | :--- | :--- | :--- | :--- |
| **Micro Finance Scheme** | Project Cost $\le$ ₹1,40,000 (Small projects) | **6.5%** per year | 36 months (3 years) | **3 months** |
| **Term Loan Scheme** | Project Cost > ₹1,40,000 up to ₹50,00,000 | **8.0%** (subsidized to 7.0%) | 84 months (7 years) | **6 months** |

- If you bring ₹10,000 $\rightarrow$ Project is ₹1,00,000 $\rightarrow$ **Micro Finance Scheme**!
- If you bring ₹50,000 $\rightarrow$ Project is ₹5,00,000 $\rightarrow$ **Term Loan Scheme**!
- If you bring ₹0 $\rightarrow$ The calculator says: *"Hey, you need at least ₹1 in your piggy bank!"*

### The "Nap Time" Before Paying (Moratorium)
When you buy baby chicks, they can't lay eggs on Day 1! They need time to grow up into big hens.
If the bank asked Ramesh for loan money on the very first month, he wouldn't have any money yet!

So the bank gives him a **Moratorium** (Nap Time):
- For small micro loans: **3 months** nap time.
- For big term loans: **6 months** nap time.
During nap time, Ramesh only pays the tiny interest; he doesn't have to repay the big principal until his hens start laying eggs!

### The Sinking Ice Cream Cone (Reducing Balance EMI)
How much does Ramesh pay each month after the nap time?
In `backend/app/core/loan_schedule.py`, we use the world's standard **Reducing Balance Formula**:

$$\text{EMI} = P \times r \times \frac{(1 + r)^n}{(1 + r)^n - 1}$$

- $P$ = Loan Amount (Principal, e.g. ₹4,50,000)
- $r$ = Monthly interest rate ($\frac{\text{Annual Rate}}{12 \times 100}$, e.g. $\frac{7}{1200}$)
- $n$ = Number of months (e.g. 84 months)

**Why is it called "Reducing Balance"?**
Think of an ice cream cone on a hot day:
Every month, Ramesh pays a fixed chunk of money. Part of it pays the bank's fee (interest), and the rest bites off a piece of the ice cream cone (principal).
Next month, because the ice cream cone is smaller, the bank's fee is smaller, so more of his money goes towards finishing the cone! At month 84, the cone is completely eaten: balance = **₹0.00**!

### The Government Gift (Capital Subsidy)
The government wants farmers to succeed, so they give a **Capital Subsidy**:
- The scheme gives **25%** of the project cost as a cash grant!
- On a ₹6,00,000 farm, 25% is ₹1,50,000!
- But there is a ceiling rule: **`SUBSIDY_CAP = ₹5,00,000`**. Even if you build a ₹1 Crore farm, the maximum government gift is capped at ₹5 Lakhs.

---

## 4. The Magic Map & Competitor Radar: Geocoding & OpenStreetMap

How does the app know where Ramesh's village is, and who his competitors are?

### Finding the Village (Nominatim Geocoding)
In `backend/app/core/geocoder.py`:
When Ramesh types: *"Akola, Maharashtra"*:
1. The app calls **OpenStreetMap Nominatim** (a free public atlas).
2. Nominatim looks through India's boundary box (`viewbox = 68.17, 7.96, 97.40, 35.49`).
3. It finds the exact GPS latitude and longitude:
   - Latitude: `20.7002° N`
   - Longitude: `77.0082° E`

### The Competitor Radar (Overpass API)
In `backend/app/core/osm_fetcher.py`:
Once we have the GPS pin, the app fires a radar query using the **OpenStreetMap Overpass API**:
- *"Draw an invisible circle with a 5 kilometer radius around this pin."*
- *"Search for any existing points of interest that match our business category!"*

We have a tag dictionary matching rural businesses to map tags:
- **Poultry** $\rightarrow$ `shop=poultry`, `landuse=farmyard`
- **Dairy** $\rightarrow$ `shop=dairy`, `amenity=dairy`, `shop=farm`
- **Grocery** $\rightarrow$ `shop=convenience`, `shop=supermarket`
- **Flour Mill** $\rightarrow$ `shop=flour`, `industrial=mill`
- **Fertilizer** $\rightarrow$ `shop=agrarian`, `shop=agricultural_supplies`

The Overpass radar counts the hits:
- 0 to 2 competitors $\rightarrow$ **"Sparse" Density** (Awesome news! Plenty of room for Ramesh!)
- 3 to 7 competitors $\rightarrow$ **"Moderate" Density** (Fair competition)
- 8 or more competitors $\rightarrow$ **"Dense" Density** (Careful! The village is already crowded!)

### The Secret Safety Net (Fallback Locations)
What if the public satellite service in Europe is sleeping or slow?
In our latest upgrade to `geocoder.py`, we built a **built-in Indian district atlas**:
If Nominatim takes longer than 6 seconds to answer, our system doesn't crash! It immediately looks in its internal memory book:
- Did you say *Nagpur*? $\rightarrow$ GPS: `(21.1458, 79.0882)`
- Did you say *Akola*? $\rightarrow$ GPS: `(20.7002, 77.0082)`
- Did you say *Barabanki*? $\rightarrow$ GPS: `(26.9268, 81.1834)`
- Did you say *Pune*? $\rightarrow$ GPS: `(18.5204, 73.8567)`
The app keeps smiling and moves forward without skipping a beat!

---

## 5. The AI Brain with Seatbelts: Groq LLM Advisory

Now we have:
1. Ramesh's financial numbers (exact math).
2. The real GPS location.
3. The real competitor count from OpenStreetMap.

Now we hand all three facts to our AI brain in `backend/app/core/advisory.py`. We use **Groq** running an ultra-fast large language model (`llama-3.3-70b-versatile`).

### Why the AI Isn't Allowed to Make Up Fairy Tales
Normal AI chatbots love to make things up (called "hallucinations"). If an AI invents fake competitor shops, Ramesh could lose his life savings!

To protect Ramesh, we put a tight seatbelt on the AI:
```
"You are an expert rural banking advisor. 
You are strictly bounded by the supplied OSM competitor count: {competitor_count}.
You MUST NOT invent any competitors that are not listed here.
You MUST output valid JSON matching this exact structure."
```
The AI is only allowed to fill in the qualitative wisdom:
- What are the seasonal weather risks? (e.g., monsoon humidity in Vidarbha).
- Where should Ramesh sell his eggs? (nearby mandis and weekly village bazaars).
- What should his pricing strategy be? (cost-plus targeting 20-25% gross margin).

### The Market Viability Score
On the report screen, you see a big green circle that says **90% High Potential**!
How is that calculated?
In `frontend/src/components/MarketReport.jsx`:
- Baseline starting score: **85 points**.
- If competitor density is **Sparse** or **None**: $+5$ points $\rightarrow$ **90%**!
- If competitor density is **Moderate**: $-10$ points $\rightarrow$ **75%**.
- If competitor density is **Dense**: $-20$ points $\rightarrow$ **65%**.
The score is clamped between 20% and 100%.

### The SWOT Mystery Box
Every bank manager wants to see a **SWOT Analysis** before stamping a loan:
- **S (Strengths)**: What you are good at (e.g. *Existing land ownership, cheap local organic feed*).
- **W (Weaknesses)**: What you lack (e.g. *Inconsistent electricity, need a solar backup*).
- **O (Opportunities)**: Good things coming (e.g. *State solar subsidies available this quarter, rising egg demand in cities*).
- **T (Threats)**: Things to watch out for (e.g. *Bird flu season, feed price changes*).

---

## 6. The Talking Helper & Polyglot Parrot: Voice & Languages

Rural business owners might not want to type on a tiny keyboard. They want to talk!

### Talking with Your Voice
In `frontend/src/components/FloatingVoiceAgent.jsx`:
- **Hearing**: When you tap the big microphone button, the browser uses the **Web Speech Recognition API** (`webkitSpeechRecognition`).
  - It listens in Indian English accent (`en-IN`) and Hindi.
  - When Ramesh says: *"Open calculator"* or *"Show report"* or *"What is my subsidy?"*, the microphone hears it!
- **Speaking**: When the advisor answers, it uses the **Web SpeechSynthesis API** (`window.speechSynthesis`) to speak out loud in a friendly voice!
- **Instant Actions**:
  - Say *"Open calculator with ₹1,00,000"* $\rightarrow$ It changes the margin to ₹1 Lakh and jumps directly to the Scheme Calculator!
  - Say *"Market prices"* $\rightarrow$ It jumps to the Live Mandi Prices tab!

### The Polyglot Parrot (`react-i18next`)
Our app has a magic switch at the top: **[EN | मराठी | हिन्दी]**.
When you click **मराठी**:
- It doesn't reload the webpage!
- It doesn't ask the server!
- In `src/i18n.js`, `react-i18next` instantly swaps every word using dictionary files (`src/locales/`):
  - *"Dashboard"* becomes *"डॅशबोर्ड"*
  - *"Feasibility Reports"* becomes *"व्यवहार्यता अहवाल"*
  - *"Loan Amount"* becomes *"कर्ज रक्कम"*
  - *"Ask Advisory Bot"* becomes *"सल्लागार बॉटला विचारा"*
- It remembers your choice in your browser's backpack (`localStorage`), so when you come back tomorrow, it still greets you in Marathi!

---

## 7. The Journey of a Click: Step-by-Step Data Flow

What happens in the computer when Ramesh clicks **"Generate Feasibility Report"**? Here is the story step-by-step:

```
[1. Ramesh types 'Akola, Maharashtra' and '₹50,000']
                       |
                       v
[2. Frontend calls POST http://localhost:8000/api/generate-report]
                       |
                       +---> Step A: Geocoder looks up 'Akola' -> (20.7002, 77.0082)
                       |
                       +---> Step B: Overpass API counts nearby poultry shops -> 'Sparse'
                       |
                       +---> Step C: Math Engine calculates:
                       |             Project = ₹5,00,000, Loan = ₹4,50,000, 7% for 84 mo
                       |
                       +---> Step D: Groq AI writes SWOT, Market Viability, Pricing
                       |
                       v
[3. Backend sends back beautiful JSON packet to Frontend]
                       |
                       v
[4. MarketReport.jsx renders the 90% score, pie charts, and monthly EMI schedule!]
                       |
                       v
[5. Ramesh clicks 'Download PDF']
                       |
                       v
[6. Python generates an official stamped bank PDF (ReportLab) ready for submission!]
```

---

## 8. The Emergency Cushions: Why the App Never Crashes

In the real world, things can go wrong:
- What if the village cell tower has weak signal?
- What if OpenStreetMap is down?
- What if Nominatim takes 20 seconds?

We built **triple safety cushions**:
1. **The Geocoding Cushion**: If Nominatim is slow (>6s) or blocked, the backend automatically reads from our internal Indian district atlas.
2. **The Overpass Cushion**: If the competitor radar fails, it doesn't crash; it assumes a safe, default baseline ("Sparse", 2 competitors) and proceeds.
3. **The Frontend Cushion**: In `Dashboard.jsx`, if the backend server cannot be reached, the browser immediately calculates the math locally using standard banking formulas and presents the report anyway! The farmer is **never** left staring at a frozen screen!
4. **The Modal Cushion**: If the user wants to close the voice agent, they can click the (X) button, click outside on the backdrop, or tap the `Escape` key on their keyboard.

---

## 9. The Big Cheat-Sheet

Here is a quick summary of the formulas, thresholds, and files in the project:

### 1. Math Formulas
- $\text{Project Cost} = \frac{\text{Margin Capital}}{0.10}$
- $\text{Loan Amount} = \text{Project Cost} \times 0.90$
- $\text{Subsidy} = \min(\text{Project Cost} \times 0.25, 500000)$
- $\text{Monthly EMI} = P \times r \times \frac{(1+r)^n}{(1+r)^n - 1}$
- $\text{Viability Score} = \text{clamp}(85 \pm \text{Density Adjustment}, 20, 100)$

### 2. Scheme Thresholds
- **Project Cost $\le$ ₹1,40,000**: *Micro Finance Scheme* (6.5% interest, 36 months, 3 months moratorium).
- **Project Cost > ₹1,40,000**: *Term Loan Scheme* (8.0% base / 7.0% subsidized, 84 months, 6 months moratorium).

### 3. File Map
| File Path | What It Does (In 5 Words) |
| :--- | :--- |
| `backend/app/core/calculator.py` | Strict rule-based loan math. |
| `backend/app/core/loan_schedule.py` | Month-by-month repayment calendar. |
| `backend/app/core/geocoder.py` | Turns village name into GPS. |
| `backend/app/core/osm_fetcher.py` | Counts nearby competitor shops. |
| `backend/app/core/advisory.py` | Groq AI writing bank advice. |
| `backend/app/api/routes.py` | Connects backend to the web. |
| `frontend/src/components/Dashboard.jsx` | Main application screen & router. |
| `frontend/src/components/MarketReport.jsx` | Visual report with viability score. |
| `frontend/src/components/SchemeCalculator.jsx`| Interactive sliders for loan terms. |
| `frontend/src/components/FloatingVoiceAgent.jsx`| Voice listening & advisory bot. |
| `frontend/src/locales/` | English, Marathi, Hindi dictionaries. |

---

> 🎉 **And that's it!** That is the secret recipe of how FinGrow Advisory takes a simple dream and a few coins in a village piggy bank, and turns it into a real, thriving, bank-funded business!
