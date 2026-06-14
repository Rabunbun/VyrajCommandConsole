import Link from "next/link";
import { submitJoinApplicationAction } from "@/app/join/actions";
import { getActivePublicCorps } from "@/lib/public-data";

export const dynamic = "force-dynamic";

const interestOptions = [
  "PvP / Small Gang",
  "Fleet PvP",
  "Pochven",
  "Industry",
  "Mining",
  "Logistics / Hauling",
  "Exploration / Scouting",
  "Wormholes",
  "Faction Warfare",
  "Market / Trade",
  "New Player Training",
  "Other"
];

const spEstimateOptions = [
  "Under 5M",
  "5M-20M",
  "20M-50M",
  "50M-100M",
  "100M+",
  "Prefer not to say"
];

type JoinPageProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const [corps, params] = await Promise.all([
    getActivePublicCorps(),
    searchParams
  ]);
  const success = sanitizeMessage(params?.success);
  const error = sanitizeMessage(params?.error);

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Public Recruitment</div>
        <h1 className="page-title">Join Vyraj</h1>
        <p className="page-copy">
          Tell us who you are, what you want to fly, and which corp looks like
          the right fit. Applications do not grant access; leadership reviews
          them through the recruitment queue.
        </p>
        <div className="badge-row">
          <Link className="secondary-button" href="/#corp-directory">
            View Corps
          </Link>
          <Link className="secondary-button" href="/">
            Alliance Hub
          </Link>
        </div>
      </header>

      {success ? <ApplicationSuccess message={success} /> : null}
      {error ? <div className="error-state">{error}</div> : null}

      <section className="form-panel form-panel-wide" aria-labelledby="join-form-title">
        <div className="card-heading">
          <h2 className="section-title" id="join-form-title">
            Application Uplink
          </h2>
          <p className="card-copy">
            No EVE SSO is required for this form. Discord integration is planned
            for a later pass; for now the application is saved into the Vyraj
            recruitment review queue.
          </p>
        </div>

        {corps.length ? (
          <form action={submitJoinApplicationAction} className="section-stack">
            <div className="form-grid">
              <label className="field-stack">
                <span className="field-label">Character Name</span>
                <input
                  autoComplete="off"
                  className="text-input"
                  name="characterName"
                  required
                />
              </label>

              <label className="field-stack">
                <span className="field-label">SP Estimate</span>
                <select className="text-input" name="spEstimate" required>
                  <option value="">Select range</option>
                  {spEstimateOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="field-label">Desired Corp</span>
                <select className="text-input" name="desiredCorpId" required>
                  <option value="">Choose corp</option>
                  {corps.map((corp) => (
                    <option key={corp.slug} value={corp.id}>
                      {corp.name} [{corp.ticker}]
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="field-label">Discord Username Optional</span>
                <input
                  autoComplete="off"
                  className="text-input"
                  name="discordName"
                  placeholder="name or name#0000"
                />
              </label>
            </div>

            <fieldset className="fieldset-panel">
              <legend className="field-label">Areas of Interest</legend>
              <div className="checkbox-grid">
                {interestOptions.map((option) => (
                  <label className="checkbox-row" key={option}>
                    <input name="areasOfInterest" type="checkbox" value={option} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field-stack">
              <span className="field-label">Brief Explanation</span>
              <textarea
                className="text-input"
                name="explanation"
                placeholder="Tell us why you would like to join and what you are looking for."
                required
                rows={6}
              />
            </label>

            <div className="badge-row">
              <button className="command-button" type="submit">
                Submit Application
              </button>
              <Link className="secondary-button" href="/login">
                Login with EVE
              </Link>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            No active or trial corps are currently listed for applications.
          </div>
        )}
      </section>
    </div>
  );
}

function ApplicationSuccess({ message }: { message: string }) {
  return (
    <section className="success-state" aria-label="Application submitted">
      <div className="card-heading">
        <h2 className="section-title">{message}</h2>
        <p className="card-copy">
          Your application is now in the recruitment review queue. EVE SSO can
          still be used for identity verification, but it does not grant access
          by itself.
        </p>
      </div>
      <div className="badge-row">
        <Link className="command-button" href="/">
          Alliance Hub
        </Link>
        <Link className="secondary-button" href="/login">
          Login with EVE
        </Link>
      </div>
    </section>
  );
}

function sanitizeMessage(value: string | undefined) {
  if (!value) {
    return "";
  }

  if (/NEXT_|digest:/i.test(value)) {
    return "Action could not be completed. Please try again.";
  }

  return value.trim();
}
