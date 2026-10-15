# Senenity Atelier

React client book backed by MongoDB. Client profiles, measurements, notes, and compressed photos are stored in MongoDB. Creating or updating a client emails the client's name, commission, fitting date, and measurements to the configured atelier email address.

## Configure

1. Create a MongoDB Atlas cluster and a database user. Add your current IP to the Atlas network allowlist, then copy the cluster connection string.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to that connection string.
3. Set `MEASUREMENT_EMAIL_TO` to the atelier inbox. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `MEASUREMENT_EMAIL_FROM` for the sender. For Gmail, use an app password rather than the account password.
4. Install packages and start both the API and the React development server:

   ```powershell
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

Open `http://localhost:5173`. The API runs on port 3001. MongoDB creates the `clients` collection when the first client is saved. Existing browser-only records are not automatically migrated.

For production, run `npm run build` and `npm start`. Set `HOST=0.0.0.0` only when your hosting provider requires it. The API does not yet include user sign-in, so keep it local; add authentication and HTTPS before making client records available over a network. Measurement emails contain personal client information, so use a protected atelier mailbox."# Senenity-atelier-project" 
"# Senenity-atelier-project" 
