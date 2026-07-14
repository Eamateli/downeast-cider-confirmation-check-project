# Connecting Gmail (one-time Google setup, about 10 minutes)

The Gmail feature is optional. The app works fully without it in Test mode.
To read real supplier emails, you create a small Google "app" once and paste
two keys into the project. No coding, just clicking through Google's console.

Google recently renamed these screens to **Google Auth Platform**. The steps
below match the new layout. If you see slightly different names, the wording in
brackets is the older label.

## 1. Create a project and turn on Gmail

1. Go to https://console.cloud.google.com and sign in.
2. Top left, create a new project (any name, e.g. `downeast confirmation`).
3. In the search bar type **Gmail API**, open it, and click **Enable**.

## 2. Set who is allowed to use it (Audience)

1. Open **Google Auth Platform** (search "OAuth" or "Auth Platform" if needed).
2. Go to **Audience**.
3. **User type** should be **External**.
4. Under **Test users**, click **Add users**, type your own Gmail address, Save.
   This step is essential. Until Google verifies the app, only the addresses
   listed here can connect. If you skip it you will see "Access blocked: app
   has not completed verification" when you try to connect.
5. Leave **Publishing status** on **Testing**. Do not click "Publish app".

## 3. Create the credentials (Clients)

1. Go to **Clients** [older label: Credentials].
2. Click **Create OAuth client** [older: Create credentials, OAuth client ID].
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, click Add and enter exactly:
   `http://localhost:3000/api/google/callback`
   (After you deploy, come back and also add
   `https://YOUR-APP.vercel.app/api/google/callback`.)
5. Click Create.
6. A popup shows the **Client ID**. The **Client secret** is not in the popup:
   click **Download JSON**, or click **OK** then open the client under
   **Clients** to copy the secret. It looks like `GOCSPX-...`.

## 4. Put the two keys into the app

Open the file `.env.local` in the project and add these two lines:

```
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Save the file, then stop and restart the app (`npm run dev`). Env keys only
load when the app starts.

## 5. Connect and use it

1. In Gmail, create a label spelled exactly `suppliers` and apply it to the
   supplier emails you want checked. (The `demo-kit` folder has ready-made
   ones you can send yourself.)
2. In the app, turn the **Test** slider OFF, then click **Connect to Google**.
3. Sign in. You will see "Google hasn't verified this app". Click **Continue**
   (small link, bottom left). This is expected for an unverified demo app.
4. Allow the two Gmail permissions (read and send). You land back on the app
   with a green **Google connected** badge, and it stays connected.

## Good to know

- Your sign-in is kept only in your own browser (an httpOnly cookie), never on
  a server. Disconnect by clearing the site's cookies.
- If the browser is set to clear cookies on exit (common in Brave), it will log
  you out when you close it. Allow cookies for `localhost` to stay connected.
- The app never emails on its own: only the **Send reply** button, or the
  **Auto-send when green** toggle, and only for green (matching) results.
