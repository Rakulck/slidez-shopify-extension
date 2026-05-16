# Shopify App Reviewer — Test Credentials
# Shopify App Store Submission (req 4.5.4 & 4.5.5)

## How to submit these to Shopify
In the Partner Dashboard → App submission form → **"Test credentials"** field,
paste the content from the "Credentials Block" section below.
Keep this file updated — Shopify reviewers will use it to test the live app.

---

## Credentials Block
(Fill in all fields marked with ← before submitting)

```
Development store URL:
  https://[YOUR-DEV-STORE].myshopify.com  ←

Staff account login:
  Email:    reviewer@slidez.social  ← create this staff account in the dev store
  Password: [SET A STRONG PASSWORD]  ←

What the reviewer should test:
  1. Install the app from the app listing (use the store above)
  2. Complete onboarding — select "Clothing" as store type, choose Free plan
  3. Go to Products → enable try-on on any product
  4. Go to Settings → change button text/colour → Save
  5. Go to the storefront product page → click the try-on button → upload a photo
  6. Go to Analytics → verify try-on count increments
  7. Go to Billing → verify Growth/Pro/Enterprise plans are shown
  8. Uninstall and reinstall → confirm OAuth screen appears again

Notes for reviewer:
  - The theme extension must be added via Themes → Customize → Add block
    (detailed instructions are shown in the app's onboarding screen)
  - Firebase AI processing may take 5–15 seconds on first try-on
  - Support contact: info@slidez.social
```

---

## Setup Instructions (for you, before submission)

### 1. Create the development store

1. Log in to [partners.shopify.com](https://partners.shopify.com)
2. Go to **Stores** → **Add store** → **Development store**
3. Name it something like `slidez-review-store`
4. Add 3–5 products with clothing/fashion images (use Shopify's free stock photos)

### 2. Create a staff reviewer account

1. In the dev store admin → **Settings** → **Users and permissions**
2. Click **Add staff**
3. Email: `reviewer@slidez.social` (or any address you control)
4. Permissions: **Full permissions** (reviewers need to see everything)
5. Set a strong password and save it in this file above

### 3. Install and configure the app on the dev store

1. Run `shopify app deploy` to push the latest build
2. Install the app on the dev store via the partner dashboard
3. Complete onboarding on the dev store
4. Enable try-on on at least 2 products
5. Add the theme extension block in the Theme Editor:
   - Themes → Customize → navigate to a product page template
   - Add block → Apps → Virtual Try-On Widget
   - Save

### 4. Verify the reviewer flow end-to-end

Before submitting, log in as the reviewer account and run through every step
in the "What the reviewer should test" list above. Fix anything that breaks.

### 5. Emergency contact

Register your emergency developer contact in the Partner Dashboard:
- Partners → Settings → Emergency contact
- Name: [YOUR NAME]  ←
- Email: info@slidez.social
- Phone: [YOUR PHONE NUMBER]  ←

This is **required** (req 4.5.6) and separate from the test credentials.
