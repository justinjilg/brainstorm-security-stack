<!-- Agent: taylor-qa | Model: gemini-2.5-flash | Cost: $0.0474 | Latency: 297465ms -->
<!-- Route: explicit | Quality: 0.61 | Reputation: gold -->
<!-- Budget remaining: $50.00 -->
Alright team, Taylor here. I've broken down Sage's PRD, Quinn's architecture, River's threat model, and Casey's API security requirements. My job is to ensure that when we ship this CSPM scanner, it *actually works* and, more importantly, it *fails safely* when it needs to. If it doesn't have a test, it doesn't work. Period.

Here's how I envision our test strategy, designed to find all the unhappy paths before our users do.

---

# CSPM Scanner v1 Test Strategy

## 1. Test Pyramid: Unit / Integration / End-to-End Ratios and Tooling for Go Services

My philosophy is clear: Unit tests are the foundation. Integration tests
