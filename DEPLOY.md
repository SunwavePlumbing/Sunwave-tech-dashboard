# DEPLOY YOUR DASHBOARD IN 4 STEPS (5 MINUTES)

## Step 1: Sign Up for Railway (1 minute)
- Go to **https://railway.app**
- Click "Start Free"
- Sign up with GitHub or email
- Done

## Step 2: Create Project (1 minute)
- Click "New Project"
- Select "Deploy from GitHub"
- Connect your GitHub account
- Choose the `sunwave-tech-dashboard` repo
- Click "Deploy"

## Step 3: Add Your API Key (30 seconds)
- Once deployed, go to "Variables" tab
- Click "New Variable"
- Name: `HOUSECALL_PRO_API_KEY`
- Value: `cb21888a24dd4d76a69c9c34f6fbe73d`
- Click "Add"

### Optional: Email admins when techs report KPI issues
Add these Railway variables to send issue-report alerts through Mailgun:

- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAILGUN_ADMIN_TO`
- `MAILGUN_FROM`
- `PUBLIC_BASE_URL`

If your Mailgun domain is in the EU region, also set `MAILGUN_BASE_URL` to `https://api.eu.mailgun.net`.

The app also sends one monthly admin reminder to reconcile the previous month's KPI jobs. By default it starts checking on the 1st at 9 AM Eastern and sends once during the first 7 days of the month. To customize it, add:

- `KPI_RECONCILE_REMINDER_ENABLED`
- `KPI_RECONCILE_REMINDER_DAY`
- `KPI_RECONCILE_REMINDER_HOUR`
- `KPI_RECONCILE_REMINDER_WINDOW_DAYS`

## Step 4: Get Your Live URL (30 seconds)
- Go to "Deployments" tab
- Click the green deployment
- Copy the URL under "Domains"
- **That's your live dashboard**

---

## Done! 

Your techs can now:
1. Bookmark that URL
2. Check their performance anytime on their phone
3. See live data updated every 5 minutes

---

## If You Don't Want to Set This Up

Just reply and tell me:
- Your GitHub username
- Your email (for Railway account)

And I'll write out the exact terminal commands to do it. But honestly, the 4 steps above are literally just clicking buttons.

---

## Troubleshooting

**"Error loading data"**
- Check that your API key is in Railway Variables
- Verify it's the HCP read-only key

**"No data"**
- Make sure jobs are marked "completed" in Housecall Pro
- Wait a few seconds for data to load

**Still stuck?**
- Reply and let me know what step you're on

---

**You've got this. 5 minutes and your team has live data.**
