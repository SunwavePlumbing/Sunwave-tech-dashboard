# Depreciation Schedule — Debugging Guide

## What Was Fixed

The depreciation schedule feature had a critical bug in how it parsed QuickBooks' balance sheet response:

### Issue
The balance sheet parsing function only looked for account data in `row.Summary.ColData` entries, but individual asset accounts (like "Streamliner 1", "Tools, machinery, and equipment") are actually returned in `row.ColData` entries, not summaries.

### Fixes Applied
1. **Fixed balance sheet walking logic** (`/api/depreciation-schedule`):
   - Now checks BOTH `row.ColData` (individual accounts) AND `row.Summary.ColData` (summary rows)
   - Previously only checked summaries, missing the actual assets

2. **Fixed column indexing**:
   - Now correctly uses the last money column (current balance) instead of assuming column index 1
   - Handles QB responses with multiple months of data

3. **Flexible account name matching**:
   - Tries multiple patterns for depreciation account names:
     - `Acc. Depr. ${assetName}`
     - `Accumulated Depreciation - ${assetName}`
     - `Acc. Depreciation - ${assetName}`
     - `Acc. Amort. ${assetName}`
     - `Accumulated Amortization - ${assetName}`
   - Falls back to fuzzy matching if no exact pattern matches

4. **Comprehensive logging**:
   - Logs all accounts found in QB
   - Logs which depreciation accounts matched which assets
   - Warns if an asset has a cost but no depreciation account found

## How to Test & Debug

### Step 1: Check QB Account Names
Visit `http://localhost:3000/api/debug/qbo-accounts` (when your server is running with QB connected).

This will show:
- `allAccounts`: Every account QB found (filtered by non-Total entries)
- `assetLike`: Asset accounts (positive balances, not liabilities/equity)
- `deprLike`: Depreciation/amortization accounts

### Step 2: Compare with assets-register.json
Look at `/assets-register.json` and check:
- Asset names in `qbAccountName` field (e.g., "Streamliner 1", "Tools, machinery, and equipment")
- These must EXACTLY match what QB calls them (case-sensitive!)

### Step 3: Watch the Server Logs
When you access `/api/depreciation-schedule`, look for:
```
[depreciation] Found asset accounts: [...]
[depreciation] Found depreciation accounts: [...]
[depreciation] Matched "Streamliner 1" depr account: "..." = 5000
[depreciation] WARNING: Asset "SomeAsset" has cost ... but no depreciation account found
```

### Step 4: Update assets-register.json if Needed
If account names don't match:
- Update the `qbAccountName` field to match QB exactly
- Example: If QB calls it "Vehicles - Van 1" instead of "Streamliner 1", update the json

## Expected Result
Once account names match and QB is connected:
- `/api/depreciation-schedule` returns `connected: true`
- Depreciation section appears in the Owners view
- Shows asset cost, accumulated depreciation, and book value per asset
- Summary totals by category (Vehicles, Tools & Equipment, etc.)

## Files Modified
- `server.js`: Fixed balance sheet parsing, improved logging
- `assets-register.json`: (No changes, but may need updating if account names don't match QB)

## Next Steps
1. When you next run the server with QB connected, check the debug endpoint
2. Share the results if depreciation cards still don't appear
3. We can then update the asset register with the correct QB account names
