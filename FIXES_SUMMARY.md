# Depreciation Schedule — Fixes Applied

## The Problem
The depreciation schedule cards weren't showing asset information because the balance sheet parsing function had a critical bug. It was **only looking for asset accounts in summary rows** (`row.Summary.ColData`), but QB actually returns individual asset accounts in regular account lines (`row.ColData`).

## What Was Fixed

### 1. **Balance Sheet Parsing** (Critical Fix)
- Now checks BOTH `row.ColData` (individual accounts) and `row.Summary.ColData` (summary rows)
- Fixed column indexing to use the last money column (current balance) instead of column 1
- This is the main fix — the original code was missing all the individual assets

### 2. **Account Name Matching**
- Made depreciation account name matching case-insensitive
- Tries multiple patterns: `Acc. Depr.`, `Accumulated Depreciation`, `Acc. Amort.`, etc.
- Falls back to fuzzy matching if no exact pattern matches
- This handles variations in how QB names depreciation accounts

### 3. **Error Handling & Logging**
- Added comprehensive logging to show:
  - When asset register is loaded
  - Whether balance sheet has data
  - What accounts were found
  - Which accounts matched which assets
  - Clear warnings if assets exist but no depreciation account is found
- Better error messages for QB connection issues

### 4. **Debug Endpoint**
- Added `/api/debug/qbo-accounts` endpoint
- Returns all QB accounts found in balance sheet
- Shows asset-like and depreciation-like accounts separately
- Helps troubleshoot account name mismatches

## How to Test

### Step 1: Start the server with QB connected
```bash
npm start
```
(Make sure your QB credentials are in environment variables)

### Step 2: Check the server logs
When the depreciation endpoint is called, look for:
```
[depreciation] Loaded asset register with 10 assets
[depreciation] Balance sheet fetch successful, has Rows: true
[depreciation] Found 7 asset accounts: [...]
[depreciation] Found 7 depreciation accounts: [...]
[depreciation] Matched "Streamliner 1" depr account: "..." = 5000
```

### Step 3: Check the debug endpoint
Visit: `http://localhost:3000/api/debug/qbo-accounts`

This will show you:
- `assetLike`: All asset accounts QB found
- `deprLike`: All depreciation accounts QB found

Compare these with `assets-register.json` to see if account names match.

### Step 4: Update assets-register.json if needed
If QB account names don't match the register (e.g., QB calls it "Vehicles - Streamliner 1" instead of "Streamliner 1"):
1. Update the `qbAccountName` field in `assets-register.json`
2. Restart the server
3. The depreciation section should now appear with data

### Step 5: Check the Owners view
The depreciation section should now appear with:
- Summary cards showing total cost, accumulated depreciation, and book value
- Categories (Vehicles, Tools & Equipment, Software, etc.)
- Individual assets with cost, book value, and depreciation percentage

## Files Changed
- `server.js`: Fixed balance sheet parsing, added debug endpoint, improved logging
- `assets-register.json`: (No changes, but may need updates if account names don't match QB)
- `DEPRECIATION_DEBUG.md`: Detailed debugging guide
- `FIXES_SUMMARY.md`: This file

## Expected Result
Once everything is working:
- `/api/depreciation-schedule` returns `connected: true` with asset data
- Depreciation section appears in Owners tab
- Shows all assets grouped by category with current book values
- Updates whenever QB data is refreshed (6-hour cache)

## Next Steps if Still Not Working
1. Check server logs for any error messages
2. Visit `/api/debug/qbo-accounts` and share the results
3. Verify that QB account names in the debug output exactly match `assets-register.json`
4. Look for any warnings about assets with costs but no depreciation account

The detailed debugging guide is in `DEPRECIATION_DEBUG.md`.
