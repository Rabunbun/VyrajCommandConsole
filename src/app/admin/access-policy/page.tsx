import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import { EveCharacterPortrait } from "@/components/eve-character-portrait";
import { logOfficerAudit } from "@/lib/audit";
import {
  filterAccessPolicyIdentities,
  getAccessPolicyPreviewData,
  parseAccessPolicyFilter,
  type AccessPolicyCorpReadiness,
  type AccessPolicyFilter,
  type AccessPolicyIdentityEvaluation,
  type AccessPolicyOfficerReadiness,
  type AccessPolicySummary
} from "@/lib/admin/access-policy";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type AccessPolicyPageProps = {
  searchParams?: Promise<{
    filter?: string;
    q?: string;
  }>;
};

const summaryCards: Array<{
  key: keyof AccessPolicySummary;
  label: string;
}> = [
  { key: "totalIdentities", label: "EVE Identities" },
  { key: "identitiesWithCorporationId", label: "With Corp ID" },
  { key: "identitiesMatchedToConfiguredCorp", label: "Matched Members" },
  { key: "linkedOfficers", label: "Linked Officers" },
  { key: "unlinkedVerifiedMembers", label: "Unlinked Members" },
  { key: "unmatchedIdentities", label: "Unmatched" },
  { key: "configuredCorpsWithEveIds", label: "Configured Corps" },
  { key: "corpsMissingEveIds", label: "Corps Missing IDs" }
];

export default async function AccessPolicyPage({
  searchParams
}: AccessPolicyPageProps) {
  const session = await getCurrentOfficerSession();
  const params = await searchParams;

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Access Policy",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/access-policy",
      summary: "Non-super-admin officer attempted to view Access Policy Preview."
    });

    return <AccessDenied />;
  }

  const filter = parseAccessPolicyFilter(params?.filter);
  const query = params?.q || "";
  const data = await getAccessPolicyPreviewData();
  const visibleIdentities = filterAccessPolicyIdentities(data.identities, {
    filter,
    query
  });

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Super Admin</div>
        <h1 className="page-title">Access Policy Preview</h1>
        <p className="page-copy">
          Hard Lockdown is active. This source-of-truth preview uses the same
          member matching evaluator as protected corp routes while officer tools
          remain governed by internal permissions.
        </p>
        <div className="badge-row">
          <Link className="secondary-button" href="/admin/super">
            Super Admin Console
          </Link>
          <Link className="secondary-button" href="/admin/eve-identities">
            EVE Identity Links
          </Link>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              Logout
            </button>
          </form>
        </div>
      </header>

      <section className="section-stack" aria-labelledby="policy-boundary-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="policy-boundary-title">
              Preview Rules
            </h2>
            <p className="card-copy">
              Member portal preview allows access only when an EVE character
              corporation ID matches a configured Corp EVE corporation ID.
              Officer tools remain controlled by linked active Officer records
              and internal permissions.
            </p>
          </div>
          <span className="badge" data-state="HARD_LOCKDOWN">
            Hard Lockdown Active
          </span>
        </div>
      </section>

      <SummarySection summary={data.summary} />

      <IdentityEvaluationSection
        filter={filter}
        identities={visibleIdentities}
        query={query}
        total={data.identities.length}
      />

      <CorpReadinessSection corps={data.corps} />

      <OfficerReadinessSection officers={data.officersWithoutLinkedIdentity} />
    </div>
  );
}

function SummarySection({ summary }: { summary: AccessPolicySummary }) {
  return (
    <section className="section-stack" aria-labelledby="access-summary-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="access-summary-title">
            Readiness Summary
          </h2>
          <p className="card-copy">
            High-level counts for identity, corp mapping, and officer link
            readiness.
          </p>
        </div>
      </div>
      <div className="status-grid">
        {summaryCards.map((card) => (
          <div className="status-panel" key={card.key}>
            <div className="status-label">{card.label}</div>
            <div className="status-value">{formatNumber(summary[card.key])}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IdentityEvaluationSection({
  filter,
  identities,
  query,
  total
}: {
  filter: AccessPolicyFilter;
  identities: AccessPolicyIdentityEvaluation[];
  query: string;
  total: number;
}) {
  return (
    <section className="section-stack" aria-labelledby="identity-evaluation-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="identity-evaluation-title">
            Identity Evaluation
          </h2>
          <p className="card-copy">
            {formatNumber(identities.length)} shown from {formatNumber(total)}
            {" "}verified identities.
          </p>
        </div>
      </div>

      <form className="form-panel form-panel-wide" method="get">
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Search</span>
            <input
              className="text-input"
              defaultValue={query}
              name="q"
              placeholder="Character, corporation, alliance, officer..."
            />
          </label>
          <label className="field-stack">
            <span className="field-label">Filter</span>
            <select className="text-input" defaultValue={filter} name="filter">
              <option value="all">All identities</option>
              <option value="linked">Linked officer</option>
              <option value="matched">Matched member</option>
              <option value="unmatched">Unmatched</option>
              <option value="missing-corp-id">Missing corp ID</option>
            </select>
          </label>
        </div>
        <div className="badge-row">
          <button className="command-button" type="submit">
            Apply
          </button>
          <Link className="secondary-button" href="/admin/access-policy">
            Reset
          </Link>
        </div>
      </form>

      {identities.length ? (
        <div className="data-card policy-table-shell">
          <table>
            <thead>
              <tr>
                <th>Identity</th>
                <th>Corp / Alliance</th>
                <th>Linked Officer</th>
                <th>Matched Corp</th>
                <th>Preview</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => (
                <IdentityEvaluationRow identity={identity} key={identity.id} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">No identities match this preview filter.</div>
      )}
    </section>
  );
}

function IdentityEvaluationRow({
  identity
}: {
  identity: AccessPolicyIdentityEvaluation;
}) {
  return (
    <tr>
      <td>
        <div className="identity-card-heading">
          <EveCharacterPortrait
            characterId={identity.characterId}
            characterName={identity.characterName}
            className="identity-portrait"
          />
          <div className="card-heading">
            <h3 className="card-title">{identity.characterName}</h3>
            <div className="card-subtitle">Character {identity.characterId}</div>
          </div>
        </div>
      </td>
      <td>
        <div>{formatNamedId(identity.corporationName, identity.corporationId)}</div>
        <div className="card-subtitle">
          {formatNamedId(identity.allianceName, identity.allianceId)}
        </div>
      </td>
      <td>
        {identity.linkedOfficer
          ? `${identity.linkedOfficer.officerName} / ${formatStatusLabel(identity.linkedOfficer.status)}`
          : "None"}
      </td>
      <td>{identity.matchedCorp ? identity.matchedCorp.name : "None"}</td>
      <td>
        <div className="badge-row">
          <span
            className={identity.wouldAllowMemberPortal ? "badge badge-verified" : "badge"}
            data-state={identity.wouldAllowMemberPortal ? "READY" : "DENIED"}
          >
            Member {identity.wouldAllowMemberPortal ? "Yes" : "No"}
          </span>
          <span
            className={identity.wouldAllowOfficerTools ? "badge badge-verified" : "badge"}
            data-state={identity.wouldAllowOfficerTools ? "READY" : "INACTIVE"}
          >
            Officer {identity.wouldAllowOfficerTools ? "Yes" : "No"}
          </span>
        </div>
      </td>
      <td>
        {identity.reason}
        {identity.destination ? ` Destination: ${identity.destination}.` : ""}
      </td>
    </tr>
  );
}

function CorpReadinessSection({
  corps
}: {
  corps: AccessPolicyCorpReadiness[];
}) {
  return (
    <section className="section-stack" aria-labelledby="corp-readiness-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="corp-readiness-title">
            Corp Readiness
          </h2>
          <p className="card-copy">
            Corp registry EVE corporation IDs used by active Hard Lockdown for
            portal matching.
          </p>
        </div>
        <span className="badge">{corps.length}</span>
      </div>
      <div className="data-card policy-table-shell">
        <table>
          <thead>
            <tr>
              <th>Corp</th>
              <th>Configured EVE Corp</th>
              <th>Matched Identities</th>
              <th>Corp Status</th>
              <th>Readiness</th>
            </tr>
          </thead>
          <tbody>
            {corps.map((corp) => (
              <tr key={corp.id}>
                <td>
                  <div className="card-title">{corp.name}</div>
                  <div className="card-subtitle">
                    {corp.slug} / {corp.ticker}
                  </div>
                </td>
                <td>{formatNamedId(corp.eveCorporationName, corp.eveCorporationId)}</td>
                <td>{formatNumber(corp.matchedIdentityCount)}</td>
                <td>{formatStatusLabel(corp.status)}</td>
                <td>
                  <span className={corp.readinessStatus === "Ready" ? "badge badge-verified" : "badge"}>
                    {corp.readinessStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfficerReadinessSection({
  officers
}: {
  officers: AccessPolicyOfficerReadiness[];
}) {
  if (!officers.length) {
    return null;
  }

  return (
    <section className="section-stack" aria-labelledby="officer-readiness-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="officer-readiness-title">
            Manual Officer Fallback
          </h2>
          <p className="card-copy">
            These officer accounts do not have a linked EVE identity yet.
            Manual login remains available as a Hard Lockdown fallback.
          </p>
        </div>
        <span className="badge">{officers.length}</span>
      </div>
      <div className="module-list">
        {officers.map((officer) => (
          <article className="data-card" key={officer.id}>
            <div className="card-heading">
              <h3 className="card-title">{officer.officerName}</h3>
              <div className="card-subtitle">
                {formatStatusLabel(officer.role)} / {formatStatusLabel(officer.status)}
              </div>
            </div>
            <p className="card-copy">No linked EVE identity.</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AccessDenied() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          Super Admin access is required to view Access Policy Preview.
        </p>
      </header>
      <div className="badge-row">
        <Link className="command-button" href="/">
          Alliance Hub
        </Link>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Logout
          </button>
        </form>
      </div>
    </div>
  );
}

function formatNamedId(name: string, id: string) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
