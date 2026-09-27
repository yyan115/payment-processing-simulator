# Free public deployment

The complete app can run as **one Render Free web service with a Neon Free PostgreSQL database**. The checked-in `render.yaml` selects the free web-service plan explicitly. The same Docker image serves the React interface, Java engine and Mastercard adapter.

Hosting configuration is provided here; a public deployment has not been provisioned. You need your own free Render and Neon accounts. No paid service is required by this configuration.

## Set up PostgreSQL

1. Create a **Free** project in [Neon](https://console.neon.tech). Choose a region near the web service; the blueprint uses Singapore.
2. Open the database connection details. Use a **direct** connection for this small application so Flyway can use its normal database locks.
3. Record the hostname, database name, username and password privately. The application runs Flyway migrations on first startup.

Supply the connection details as three Render secret environment variables:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://YOUR_NEON_HOST/neondb?sslmode=require
SPRING_DATASOURCE_USERNAME=YOUR_DATABASE_USER
SPRING_DATASOURCE_PASSWORD=YOUR_DATABASE_PASSWORD
```

The JDBC URL does not contain the username or password. Render stores those separately. See [Neon’s Java connection guide](https://neon.com/docs/guides/java).

## Deploy the app

1. Push the application code to your GitHub repository.
2. In [Render](https://dashboard.render.com), choose **New → Web Service** and connect the repository. **Public Git Repository** accepts its public GitHub URL without installing the GitHub integration.
3. Select **Docker**, branch `main`, region **Singapore**, and compute **Free ($0/month)**. The form may initially select a paid compute plan, so check this explicitly.
4. Add the three database variables above and the following application settings:

   ```text
   DEMO_ENABLED=true
   RECONCILIATION_ENABLED=false
   SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=5
   SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE=0
   MASTERCARD_ENABLED=false
   ```

5. Under **Advanced**, set the health check to `/actuator/health`. Use repository root `.` as the Docker build context and `./Dockerfile` as the Dockerfile path. Leave the Docker command override empty.
6. To include Mastercard immediately, supply its sandbox settings below and set `MASTERCARD_ENABLED=true` before deploying.
7. Deploy. Render builds the frontend and backend together.
8. Open the supplied `onrender.com` URL and run the lost-response walkthrough from the README.

Alternatively, create a **Blueprint** from `render.yaml`; it defines the same Free service settings. Blueprint creation can request credit-card verification before repository selection, as observed during setup on 2026-09-28. The ordinary Web Service form provides a separate setup path. Account verification requirements remain under Render's control.

A service created from a public repository URL may require manual deployments for later commits. Confirm its auto-deploy availability in Render; pushing to GitHub alone does not prove the running service was updated.

The default deployment has the simulator available immediately. It uses private 15-minute workspaces, a 40-payout limit per workspace and bounded session admissions. Automatic reconciliation is paused so visitors control the lesson. The UI explains when a workspace expires and can open a new one.

## Enable the Mastercard view on the same deployment

Use the sandbox credentials and official test-party configuration described in [the Mastercard guide](mastercard.md). In Render’s environment settings add:

```text
MASTERCARD_ENABLED=true
MASTERCARD_PARTNER_ID=YOUR_32_CHARACTER_SANDBOX_PARTNER_ID
MASTERCARD_CONSUMER_KEY=YOUR_SANDBOX_CONSUMER_KEY
MASTERCARD_P12_BASE64=BASE64_CONTENT_OF_YOUR_P12_FILE
MASTERCARD_KEY_ALIAS=YOUR_KEY_ALIAS
MASTERCARD_KEY_PASSWORD=YOUR_KEY_PASSWORD
MASTERCARD_SENDER_ACCOUNT_URI=OFFICIAL_TEST_SENDER_URI
MASTERCARD_RECIPIENT_ACCOUNT_URI=OFFICIAL_TEST_RECIPIENT_URI
MASTERCARD_FUNDING_SOURCE=DEBIT
MASTERCARD_PAYMENT_ORIGINATION_COUNTRY=USA
MASTERCARD_REQUEST_DETAILS_PATH=/app/examples/mastercard-sandbox-parties.json
```

If using a Blueprint, change `MASTERCARD_ENABLED` to `true` there as well, so a later blueprint sync preserves that setting. Keep every credential value in the host’s secret settings, never in the blueprint.

The container decodes the signing key to a private temporary file when it starts. Base64 is an encoding, not encryption: treat that value exactly like the original private key. API responses sent to the frontend do not contain signing credentials or account URIs.

The adapter is restricted to Mastercard’s sandbox host. Demo mode caps external Mastercard requests at 12 per minute and 100 per UTC day across visitors, persisted in PostgreSQL. Requests beyond the budget preserve an uncertain payout rather than inventing a decline. You can adjust the `DEMO_MASTERCARD_CALLS_PER_MINUTE` and `DEMO_MASTERCARD_CALLS_PER_DAY` limits.

## Free-plan behavior

Checked against provider documentation on 2026-09-27:

- Render Free sleeps after 15 minutes without inbound traffic. A new visit wakes it, which can take about a minute. A free workspace has 750 instance hours monthly; quota exhaustion can suspend service. Free Render PostgreSQL expires after 30 days, which is why this setup uses Neon. [Render free-service limits](https://render.com/docs/free)
- Neon Free lists 0.5 GB storage and 100 CU-hours per project, with compute scaling to zero after five minutes idle. These are quotas, not unlimited hosting. [Neon plans](https://neon.com/docs/introduction/plans)
- Use free plans and avoid adding a payment method or enabling paid upgrades if spending must remain zero. Render documents suspension instead of supplementary billing when no payment method is present. [Render usage limits](https://render.com/docs/free)

A scheduled cleanup removes expired local demo data after a grace period. It resumes when a sleeping service wakes. An external Mastercard sandbox request is not undone by deleting the local workspace.

This is a small portfolio deployment. Free-tier performance, platform availability, registration requirements and plan limits remain under the hosting providers’ control.
