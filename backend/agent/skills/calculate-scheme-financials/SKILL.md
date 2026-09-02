---
name: calculate-scheme-financials
description: Calculates financial project cost, loan amount, and determines scheme routing based on margin capital.
---

# Calculate Scheme Financials

This skill takes a user's margin capital and calculates the total project cost (assuming margin capital is 10%) and loan amount (90%). It then routes to the appropriate loan scheme.

## Usage
Run the python script with the margin capital as the first argument:
`python calculator.py <margin_capital>`

Output will be a strict JSON string.
