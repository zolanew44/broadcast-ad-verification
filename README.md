# Broadcast Ad Verification System

A production-ready web application designed for television and radio broadcast traffic operations. The system deterministically verifies whether planned commercial advertisements aired as scheduled by auditing the daily planned schedule (`.txt`) against the actual playout automation log (`.txt` or `.log`), producing audit-grade executive KPI summaries, detailed discrepancy records, and downloadable Excel and PDF reports.

---

## 1. Key Features

- **Deterministic Reference Matching:** Matches commercial placements primarily by normalized reference code (`AAD-xxxx`, `AT-xxxx-x-ADx`, `INAD xxxx`, etc.), normalizing harmless whitespace and casing differences while preserving original text for managerial review.
- **Placement-Level & Frequency Verification:** Compares planned placement counts with actual log playouts. Detects partial deliveries (e.g. planned 2 placements, aired 1 occurrence &rarr; flags 1 placement as potentially missing with full evidence).
- **Campaign Date Expiration Isolation:** Evaluates scheduled advertisements against their contract campaign start and end dates relative to the broadcast date. Distinguishes expired or out-of-period placements from confirmed missed airings.
- **Irregular Delimiter & Charset Encoding Support:**
  - Standard UTF-8 and UTF-8 with BOM (`0xEF 0xBB 0xBF`).
  - Little-Endian UTF-16 (`UTF-16LE`) with and without Byte Order Mark (via alternating null-byte heuristic).
  - Irregular whitespace, multi-space tabs, and Amharic / Ethiopic Unicode characters.
- **Smart Upload Validation & Swap Assistance:** Detects if an operator accidentally uploads the playout log into the schedule zone (or vice-versa) and offers a one-click file swap.
- **Side-by-Side Evidence Inspector:** Click any record to view the exact scheduled line, line number, time slot, and show alongside the matching automation playout event ID, timestamp, and raw log text.
- **Session Review Workflow:** Operators can mark discrepancies as reviewed and attach session audit notes (e.g., *"Make-good scheduled on Oct 14 20:00"*).
- **Executive Reporting:**
  - **Excel Export (`.xlsx`):** Multi-sheet workbook with Executive Summary, Detailed Results, Missing Placements, Matched Airings, Extra Placements, and Campaign Date Issues.
  - **PDF Audit Report (`.pdf`):** Landscape printable document with corporate header banner, KPI metric badges, detailed audit table, and managerial notes.
- **100% In-Browser Privacy:** Runs entirely client-side using browser memory. No files are uploaded to any server or AI API. No database required.

---

## 2. Verified Test Fixture Findings (October 13, 2026)

When tested against the production sample files (`New Text Document.txt` and `2026-10-13.log`):

1. **`AAD-1918` (`DA Tigrigna up`):**
   - **Planned Placements:** 2 placements scheduled (Line #172 in *መቅዲ ሾው* and Line #368 in *Abbay Films*).
   - **Actual Playout Occurrences:** 1 occurrence logged at `17:35:19` (Line #419).
   - **Result:** 1 placement successfully matched; 1 placement correctly flagged as **Potentially Missing** with line-level evidence and make-good recommendation.
2. **`AT-1187 -1-AD1` (`Awach`):**
   - **Scheduled End Date:** October 3, 2026.
   - **Broadcast Date:** October 13, 2026.
   - **Result:** Successfully isolated as **Expired Campaign** (10 days past campaign expiration). Excluded from confirmed missed counts and reported with traffic clean-up instructions.
3. **Playout Integrity:**
   - 173 eligible placements evaluated with ~98.2% on-air compliance.
   - 16 expired campaign placements flagged for traffic schedule removal.
   - Extra playouts and potential double-plays isolated.

---

## 3. Technology Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Excel Generation:** SheetJS (`xlsx`)
- **PDF Generation:** jsPDF + jsPDF-AutoTable
- **Automated Testing:** Vitest

---

## 4. Local Installation & Development

### Prerequisites
- Node.js `v18.x` or higher (tested on Node `v24.21.0`)
- npm `v9.x` or higher

### Steps

1. **Clone or navigate to the project directory:**
   ```bash
   cd broadcast-ad-verification
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run automated test suite:**
   ```bash
   npm test
   ```
   *Executes 18 unit and integration tests covering encoding, parsers, comparison invariants, and sample file verification.*

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build and run production build locally:**
   ```bash
   npm run build
   npm run start
   ```

---

## 5. Deployment to Vercel

The application is built to Vercel's zero-configuration production standards.

### Option A: Deploy via GitHub (Recommended)

1. Push your code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Broadcast Ad Verification System"
   git branch -M main
   git remote add origin https://github.com/<your-username>/broadcast-ad-verification.git
   git push -u origin main
   ```

2. Log in to [Vercel](https://vercel.com).
3. Click **"Add New..."** &rarr; **"Project"**.
4. Select your `broadcast-ad-verification` GitHub repository and click **Import**.
5. Leave the default settings:
   - **Framework Preset:** Next.js
   - **Build Command:** `next build` (or `npm run build`)
   - **Output Directory:** `.next`
   - **Environment Variables:** None required
6. Click **Deploy**. Vercel will build and assign a permanent public HTTPS URL (e.g. `https://broadcast-ad-verification.vercel.app`).

### Option B: Deploy via Vercel CLI

1. Install the Vercel CLI globally:
   ```bash
   npm install -g vercel
   ```
2. In the project directory, run:
   ```bash
   vercel
   ```
3. Follow the CLI prompts to link to your Vercel account and deploy. Deploy to production using:
   ```bash
   vercel --prod
   ```

---

## 6. How to Use the Application

1. **Open the web application** at its deployed URL or `http://localhost:3000`.
2. **Instant Demo:** Click **"Load Sample Files"** to immediately test the system using the bundled October 13, 2026 fixtures.
3. **Upload Your Own Files:**
   - Drop the planned advertising schedule into **Area A**.
   - Drop the actual automation playout log into **Area B**.
4. **Preview & Verify:** Inspect the detected file encoding and the first 5 parsed records in the accordion preview.
5. **Compare Advertisements:** Click **"Compare Advertisements"**.
6. **Analyze Discrepancies:**
   - Review executive KPIs (Compliance Rate, Matched, Potentially Missing, Extra Airings, Expired).
   - Filter by status, show, or text search.
   - Click any record to expand full raw text evidence.
   - Mark records as reviewed and attach managerial notes.
7. **Export Reports:** Download official audit reports via **"Export Excel (.xlsx)"** or **"Export PDF Report"**.
8. **New Comparison:** Click **"New Comparison"** to clear session memory and start over.

---

## 7. Security & Compliance Statement

- **Zero Server Storage:** Uploaded schedules and logs are parsed directly in browser memory and are discarded upon tab closure or session reset.
- **No Third-Party Telemetry:** No analytics scripts, cookies, or external AI APIs are invoked.
- **Untrusted Input Sanitation:** Raw text is strictly parsed into structured data types without evaluating script blocks.
