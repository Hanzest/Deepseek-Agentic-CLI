# FIRE: Financial Independence, Retire Early

## Turn 1: Setup Static JavaScript web application for FIRE

# Developer Prompt: Advanced FIRE (Financial Independence, Retire Early) Simulation Dashboard

## Goal
Create a feature-rich, multi-page static web application that serves as a comprehensive FIRE simulation and tracking dashboard. The agent must architect, build, and modularize the entire codebase within the `z_swe/FIRE` folder (currently empty).

## Tech Stack & Architecture
* **Frontend:** ReactJS (Functional components, Hooks) with client-side routing.
* **Styling:** TailwindCSS (modern, responsive, componentized layout).
* **Backend/Server:** Node.js with Express (serving solely as a static file server to host the build).
* **State Management:** Pure in-memory React state (e.g., Context API or custom state hooks) to pass data seamlessly across pages during the active session. **No database, no localStorage, and no external file persistence.**

---

## Application Structure & Core Features (Multi-Page)

The application must be split into a cohesive, multi-page experience using a shared sidebar or top-navigation layout:

### 1. Dashboard & Analytics (`/` or `/dashboard`)
* **Visual Progress Tracking:** Implement interactive charts (using a library like Recharts or Chart.js) showing the user's net worth projection over time vs. their FIRE target line.
* **Key Performance Indicators (KPIs):** High-level summary cards displaying:
    * Current "FIRE Score" (percentage of target achieved).
    * Estimated FIRE Age vs. Target FIRE Age.
    * Years remaining until financial independence.
    * Current savings rate (calculated dynamically).
* **Milestone Timeline:** A visual component showing upcoming milestones (e.g., "Lean FIRE achieved," "Coast FIRE achieved," "100% Debt Free").

### 2. Deep-Dive Financial Profile (`/profile` or `/inputs`)
A comprehensive, tabbed input wizard split into distinct financial pillars. **Every field requires strict client-side validation (types, bounds, formatting) and sensible default values.**
* **Pillar 1: Core Metrics:** Current Age, Target Retirement Age, Current Net Worth, Annual Safe Withdrawal Rate (default: 4%).
* **Pillar 2: Income & Career:** Current Post-Tax Income, Estimated Annual Income Growth Rate (%), Expected Post-Retirement Side Income.
* **Pillar 3: Expenses & Lifestyle:** Current Annual Expenses, Expected Post-Retirement Annual Expenses (adjusting for inflation), Pre-Retirement Inflation Rate.
* **Pillar 4: Investment Strategy:** Expected Annual Investment Return (Pre-retirement), Expected Annual Investment Return (Post-retirement), Asset Allocation slider (Stocks/Bonds/Cash).

### 3. Advanced Simulation & Modeling (`/simulations`)
Allow users to stress-test their financial plans with advanced modeling features:
* **Market Variable Sliders:** Real-time sliders allowing users to dynamically adjust inflation, investment returns, and withdrawal rates to see instant updates on their charts.
* **FIRE Variations Calculator:** Toggle and compare metrics between different FIRE strategies:
    * *Traditional FIRE* (25x annual expenses).
    * *Lean FIRE* (Minimalist living, 75% of traditional expenses).
    * *Fat FIRE* (Abundant living, 125%+ of traditional expenses).
    * *Coast FIRE* (Investing enough early on so that it grows to meet traditional FIRE without further contributions).
* **What-If Scenarios:** A feature to add temporary "In-Session Events" (e.g., "Buying a house in 5 years costing $X", "Sabbatical year in 2030").

### 4. Active Scenario Comparison (`/scenarios`)
* **In-Memory Snapshots:** Ability to copy the current configuration into a temporary "Scenario Slot" (e.g., "Scenario A" and "Scenario B") held strictly in React state.
* **Side-by-Side Comparison:** A data table or dual-line chart comparing these active in-memory scenarios to see how different lifestyle choices impact the retirement timeline.

---

## UI/UX & Design Guidelines
* **Theme:** Modern, clean, and interactive. 
* **Color Palette:** White background color (`#FFFFFF`) with a primary **Orange variant palette** (e.g., Amber/Orange 500/600 for actions, metrics, and highlights) balanced with deep slates/grays for text and structural borders.
* **Responsiveness:** Perfect layout adaptation across Mobile, Tablet, and Desktop screen sizes using Tailwind breakpoints.
* **UX Transitions:** Smooth routing transitions, micro-interactions on button hovers, and animated chart rendering.
* **Data Validation UX:** Clear, non-intrusive inline error messages (e.g., "Income must be a positive number") and instant field formatting (e.g., auto-formatting currency inputs with commas).

---

## Deliverables
1.  **Source Code:** A fully modularized project structure inside `z_swe/FIRE` separating Components, Views/Pages, Hooks, and Utilities.
2.  **Configuration & Scripts:** Fully configured `package.json` containing scripts to run the application in both development and production static-serving modes.
3.  **Documentation (`README.md`):** A clean setup guide containing:
    * Prerequisites and installation steps.
    * How to run the development server.
    * An architectural breakdown explaining how the centralized React state engine handles calculations instantly across tabs without persistent storage.


