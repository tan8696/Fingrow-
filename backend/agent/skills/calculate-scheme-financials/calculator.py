import sys
import json

def calculate_financials(margin_capital: float):
    # Calculate 10% project cost and 90% loan amount
    # If margin capital is 10%, then project cost = margin_capital / 0.10
    project_cost = margin_capital * 10
    loan_amount = project_cost - margin_capital  # 90%
    
    # Apply Routing Logic
    if loan_amount <= 140000:
        scheme = "Micro Finance"
    elif loan_amount <= 5000000:
        scheme = "Term Loan"
    else:
        scheme = "Large Corporate Loan"
    
    result = {
        "margin_capital": margin_capital,
        "project_cost": project_cost,
        "loan_amount": loan_amount,
        "selected_scheme": scheme
    }
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing margin_capital argument"}))
        sys.exit(1)
    
    try:
        margin_capital = float(sys.argv[1])
        calculate_financials(margin_capital)
    except ValueError:
        print(json.dumps({"error": "Invalid margin_capital value, must be a number"}))
        sys.exit(1)
