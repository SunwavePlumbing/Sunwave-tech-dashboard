# Sunwave Tech Performance Dashboard

A real-time, live-updating dashboard that shows technician performance metrics pulled directly from Housecall Pro.

## What It Does

✅ **Live Revenue Tracking** — See each tech's MTD revenue in real-time  
✅ **Average Ticket Price** — Automatically calculated from completed jobs  
✅ **Job Count** — Total jobs per technician (current month)  
✅ **Mobile-First Design** — Perfect for phones at job sites  
✅ **Auto-Refreshes** — Updates every 5 minutes (no manual work)  
✅ **Leaderboard** — Rank techs by revenue, avg ticket, or jobs  

## How It Works

1. **Your techs** open the dashboard URL on their phone
2. **Dashboard calls** the backend API
3. **Backend fetches** your Housecall Pro data (staff + completed jobs)
4. **Aggregates** revenue and jobs per technician
5. **Displays** live leaderboard with sortable metrics
6. **Refreshes** every 5 minutes automatically

## Quick Deployment

### Option 1: Railway (Easiest)
See `DEPLOY.md` for step-by-step instructions. Takes 5 minutes.

### Option 2: Local Testing
```bash
npm install
echo "HOUSECALL_PRO_API_KEY=your_key_here" > .env
npm start
# Visit http://localhost:3000
```

## File Structure

```
.
├── server.js              # Main app (Express server + HTML dashboard)
├── package.json           # Dependencies
├── .env                   # Your API key (don't commit this)
├── DEPLOY.md             # Deployment instructions
└── README.md             # This file
```

## Configuration

You need one environment variable:

- `HOUSECALL_PRO_API_KEY` — Your Housecall Pro API key (read-only)

Set this in your deployment platform (Railway, Vercel, etc.) or in `.env` for local testing.

## API Endpoints

### GET `/`
Returns the HTML dashboard page.

### GET `/api/metrics`
Returns JSON with technician metrics:
```json
{
  "leaderboard": [
    {
      "id": "tech_123",
      "name": "John Smith",
      "monthlyRevenue": 8500,
      "jobsCompleted": 12,
      "averageTicket": 708
    }
  ],
  "summary": {
    "totalRevenue": 45000,
    "totalJobs": 65,
    "averageTicket": 692,
    "month": "April 2026"
  }
}
```

## Features

- **Sortable Leaderboard** — Click buttons to sort by revenue, avg ticket, or jobs
- **Real-Time Data** — Pulls from Housecall Pro automatically
- **Mobile Responsive** — Works great on phones and tablets
- **Dark-Mode Ready** — Adapts to device settings
- **No Configuration** — Just add API key and deploy

## Troubleshooting

### "Error loading data"
- Verify your API key is correct in environment variables
- Make sure you're using the HCP read-only key

### No data showing
- Confirm you have completed jobs in Housecall Pro this month
- Jobs must be marked as "completed" status
- Dashboard pulls data every 5 minutes, so wait a moment

### API key not working
- Double-check the key from your Housecall Pro App Store
- Make sure it's the "HCP" read-only key (not Zapier keys)

## Development

To run locally:
```bash
npm install
node server.js
```

Dashboard will be at `http://localhost:3000`

## Deployment

The app runs on any Node.js host:
- **Railway** (recommended) — See DEPLOY.md
- **Vercel** — Just connect and deploy
- **Render** — Similar to Railway
- **Heroku** — Traditional option
- **Your own server** — Just run `npm install && npm start`

## Support

If you hit issues during deployment, check:
1. Environment variable is set correctly
2. API key is valid and has data access
3. Your Housecall Pro account has completed jobs this month

---

**Your technicians now have a live performance dashboard they can check anytime. Zero manual updates needed.**
