import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getMemberLandingContext,
  getOfficerDestination,
  markMemberLandingSeen
} from "@/lib/member-landing";

export const dynamic = "force-dynamic";

export default async function MemberLandingPage() {
  const context = await getMemberLandingContext();

  if (context.accessMode === "missing_identity") {
    redirect("/login");
  }

  if (
    context.accessMode === "verified_member" &&
    context.identity &&
    !context.identity.memberLandingSeenAt
  ) {
    await markMemberLandingSeen(context.identity.id);
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">EVE SSO Checkpoint</div>
        <h1 className="page-title">Identity Verified</h1>
        <p className="page-copy">
          Verified EVE identity can guide member navigation. Vyraj officer,
          admin, and module permissions are still controlled internally.
        </p>
        <div className="badge-row">
          {context.session ? (
            <Link className="command-button" href={getOfficerDestination(context.session)}>
              Command Access
            </Link>
          ) : null}
        </div>
      </header>

      <section className="section-stack" aria-labelledby="identity-status-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="identity-status-title">
              Verified Character
            </h2>
            <p className="card-copy">
              Current character, corporation, and alliance context from EVE SSO
              identity enrichment.
            </p>
          </div>
          <span className="badge badge-verified">Verified</span>
        </div>
        <div className="status-grid">
          <StatusPanel
            label="Character"
            value={context.identity?.characterName || "Unknown"}
          />
          <StatusPanel
            label="Character ID"
            value={context.identity?.characterId || "Unknown"}
          />
          <StatusPanel
            label="Current Corp"
            value={formatNamedId(
              context.identity?.corporationName || "",
              context.identity?.corporationId || ""
            )}
          />
          <StatusPanel
            label="Current Alliance"
            value={formatNamedId(
              context.identity?.allianceName || "",
              context.identity?.allianceId || ""
            )}
          />
          <StatusPanel
            label="Last EVE Login"
            value={formatDateTime(context.identity?.lastEveLoginAt)}
          />
          <StatusPanel
            label="Identity Refreshed"
            value={formatDateTime(context.identity?.lastIdentityRefreshAt)}
          />
        </div>
      </section>

      <section className="section-stack" aria-labelledby="matched-corp-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="matched-corp-title">
              Vyraj Portal Match
            </h2>
            <p className="card-copy">
              Corp portal matching uses configured EVE corporation IDs only.
            </p>
          </div>
          <span className={context.matchedCorp ? "badge badge-verified" : "badge"}>
            {context.matchedCorp ? "Matched" : "No Match"}
          </span>
        </div>
        {context.matchedCorp ? (
          <div className="feature-grid">
            <div className="feature-card">
              <div className="card-heading">
                <h3>{context.matchedCorp.name}</h3>
                <span className="badge">{context.matchedCorp.ticker}</span>
              </div>
              <p className="card-copy">
                Matched by {formatMatchReason(context.matchedBy)}. This is a
                member navigation match, not an officer permission grant.
              </p>
              <Link
                className="command-button member-portal-action"
                href={`/corp/${context.matchedCorp.slug}`}
              >
                Enter Corp Portal
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            No configured Vyraj corp portal matched this character&apos;s current
            EVE corporation. Use the Alliance Hub navigation above for public
            routes, or contact leadership if this corp should be mapped.
          </div>
        )}
      </section>

      {context.session ? (
        <section className="section-stack" aria-labelledby="officer-status-title">
          <div className="section-heading">
            <div>
              <h2 className="section-title" id="officer-status-title">
                Officer Session
              </h2>
              <p className="card-copy">
                This EVE identity is linked to an active Vyraj officer record.
              </p>
            </div>
            <span className="badge badge-verified">Command Access</span>
          </div>
          <div className="badge-row">
            <Link className="command-button" href={getOfficerDestination(context.session)}>
              Open Command Destination
            </Link>
            {context.session.assignedCorps.map((corp) => (
              <Link
                className="secondary-button"
                href={`/corp/${corp.corpSlug}`}
                key={corp.corpId}
              >
                {corp.corpName}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatusPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-panel">
      <div className="status-label">{label}</div>
      <div className="status-value">{value}</div>
    </div>
  );
}

function formatNamedId(name: string, id: string) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatMatchReason(reason: "corporation_id" | "member_corp_id" | "none") {
  if (reason === "member_corp_id") {
    return "saved member corp match";
  }

  if (reason === "corporation_id") {
    return "EVE corporation ID";
  }

  return "no match";
}
