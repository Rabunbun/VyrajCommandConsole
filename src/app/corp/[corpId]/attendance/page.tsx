import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createOperationAction,
  submitAttendanceAction,
  updateOperationAction
} from "@/app/corp/[corpId]/attendance/actions";
import {
  attendanceStatusOptions,
  getAttendancePageData,
  operationStatusOptions,
  operationTypeOptions,
  type AttendanceCorpView,
  type OperationView
} from "@/lib/modules/attendance";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type AttendancePageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function AttendancePage({
  params,
  searchParams
}: AttendancePageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();
  const result = await getAttendancePageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="Attendance Unavailable"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="Op Attendance Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <AttendanceHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />

      <AttendanceSubmissionPanel
        corp={result.corp}
        operations={result.operations}
      />

      {result.canManageOperations ? (
        <OfficerOperationsPanel corp={result.corp} operations={result.operations} />
      ) : null}

      <OperationList
        canManageOperations={result.canManageOperations}
        corp={result.corp}
        operations={result.operations}
      />
    </div>
  );
}

function AttendanceHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: AttendanceCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Member Module</div>
      <h1 className="page-title">Op Attendance</h1>
      <p className="page-copy">
        Submit or update attendance for scheduled {corp.name} operations.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href={`/corp/${corp.slug}`}>
          Back to Corp Portal
        </Link>
        <span className="badge">{corp.name}</span>
        <span className="badge">{corp.ticker}</span>
        <span className="badge">{accessMode}</span>
      </div>
    </header>
  );
}

function UnavailableState({
  corp,
  eyebrow,
  message,
  title
}: {
  corp?: AttendanceCorpView;
  eyebrow: string;
  message: string;
  title: string;
}) {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-copy">{message}</p>
      </header>
      <div className="badge-row">
        <Link className="secondary-button" href={corp ? `/corp/${corp.slug}` : "/"}>
          {corp ? "Back to Corp Portal" : "Alliance Hub"}
        </Link>
      </div>
    </div>
  );
}

function MessageBanner({
  success,
  error
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <div className={error ? "error-state" : "success-state"} role="status">
      {error || success}
    </div>
  );
}

function AttendanceSubmissionPanel({
  corp,
  operations
}: {
  corp: AttendanceCorpView;
  operations: OperationView[];
}) {
  const availableOperations = operations.filter(
    (operation) => operation.status !== "CANCELLED"
  );

  return (
    <section className="form-panel form-panel-wide" aria-label="Submit attendance">
      <div className="card-heading">
        <h2 className="section-title">Submit Attendance</h2>
        <p className="card-copy">
          Submitting again for the same operation and character updates the
          existing record.
        </p>
      </div>

      {availableOperations.length ? (
        <form action={submitAttendanceAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <div className="form-grid">
            <label className="field-stack">
              <span className="field-label">Operation</span>
              <select className="text-input" name="operationId" required>
                {availableOperations.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.title} / {formatOptionalDate(operation.scheduledFor)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span className="field-label">Pilot / Character Name</span>
              <input className="text-input" name="characterName" required />
            </label>

            <label className="field-stack">
              <span className="field-label">Attendance Status</span>
              <select
                className="text-input"
                defaultValue="ATTENDING"
                name="attendanceStatus"
              >
                {attendanceStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span className="field-label">Ship / Role</span>
              <input className="text-input" name="roleFlown" />
            </label>

            <label className="field-stack">
              <span className="field-label">Ship Type</span>
              <input className="text-input" name="shipFlown" />
            </label>
          </div>

          <label className="field-stack">
            <span className="field-label">Notes</span>
            <textarea className="text-input" name="notes" rows={3} />
          </label>

          <div className="badge-row">
            <button className="command-button" type="submit">
              Submit Attendance
            </button>
          </div>
        </form>
      ) : (
        <div className="empty-state">No operations scheduled.</div>
      )}
    </section>
  );
}

function OfficerOperationsPanel({
  corp,
  operations
}: {
  corp: AttendanceCorpView;
  operations: OperationView[];
}) {
  return (
    <section className="section-stack" aria-label="Officer operation management">
      <details className="create-disclosure form-panel form-panel-wide">
        <summary className="create-summary">
          <span className="command-button">Create Operation</span>
        </summary>
        <div className="card-heading">
          <h2 className="section-title">Create Operation</h2>
          <p className="card-copy">
            Officer-created operations become available for member attendance
            unless marked cancelled.
          </p>
        </div>
        <form action={createOperationAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <OperationFields />
          <div className="badge-row">
            <button className="command-button" type="submit">
              Create Operation
            </button>
          </div>
        </form>
      </details>

      {operations.length ? (
        <div className="section-stack">
          <h2 className="section-title">Manage Operations</h2>
          {operations.map((operation) => (
            <details className="data-card" key={operation.id}>
              <summary className="details-summary">
                Edit {operation.title}
              </summary>
              <form action={updateOperationAction} className="section-stack">
                <input name="corpSlug" type="hidden" value={corp.slug} />
                <input name="operationId" type="hidden" value={operation.id} />
                <OperationFields operation={operation} />
                <div className="badge-row">
                  <button className="command-button" type="submit">
                    Save Operation
                  </button>
                </div>
              </form>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OperationList({
  canManageOperations,
  corp,
  operations
}: {
  canManageOperations: boolean;
  corp: AttendanceCorpView;
  operations: OperationView[];
}) {
  return (
    <section className="section-stack" aria-label="Operation list">
      <h2 className="section-title">Operations</h2>
      {operations.length ? (
        operations.map((operation) => (
          <article className="data-card" key={operation.id}>
            <div className="section-heading">
              <div className="card-heading">
                <h3 className="card-title">{operation.title}</h3>
                <div className="card-subtitle">
                  {formatOptionalDate(operation.scheduledFor)}
                </div>
              </div>
              <div className="badge-row">
                <span className="badge">{formatStatusLabel(operation.status)}</span>
                <span className="badge">{formatStatusLabel(operation.operationType || "OTHER")}</span>
                <span className="badge">{corp.ticker}</span>
              </div>
            </div>

            <p className="card-copy">
              {operation.description || "No operation description posted."}
            </p>

            <div className="metric-grid">
              <Metric label="Location" value={operation.location || "TBD"} />
              <Metric label="Doctrine" value={operation.doctrine || "TBD"} />
            </div>

            <AttendanceSummary operation={operation} />

            {canManageOperations ? (
              <AttendanceRoster operation={operation} />
            ) : null}
          </article>
        ))
      ) : (
        <div className="empty-state">No operations scheduled.</div>
      )}
    </section>
  );
}

function AttendanceSummary({ operation }: { operation: OperationView }) {
  const summaryEntries = Object.entries(operation.attendanceSummary);

  return (
    <div className="section-stack">
      <h4 className="section-title">Attendance Summary</h4>
      {summaryEntries.length ? (
        <div className="badge-row">
          {summaryEntries.map(([status, count]) => (
            <span className="badge" key={status}>
              {formatStatusLabel(status)}: {count}
            </span>
          ))}
        </div>
      ) : (
        <p className="card-copy">No attendance submitted yet.</p>
      )}
    </div>
  );
}

function AttendanceRoster({ operation }: { operation: OperationView }) {
  return (
    <details className="details-panel">
      <summary className="details-summary">Attendance Roster</summary>
      {operation.attendance.length ? (
        <div className="audit-meta-grid">
          {operation.attendance.map((entry) => (
            <div className="metric" key={entry.id}>
              <div className="metric-label">{formatStatusLabel(entry.status)}</div>
              <div className="metric-value audit-meta-value">
                {entry.characterName}
              </div>
              <p className="card-copy">
                {[entry.roleFlown, entry.shipFlown].filter(Boolean).join(" / ") ||
                  "No ship or role listed"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="card-copy">No attendance submitted yet.</p>
      )}
    </details>
  );
}

function OperationFields({ operation }: { operation?: OperationView }) {
  return (
    <>
      <div className="form-grid">
        <label className="field-stack">
          <span className="field-label">Title</span>
          <input
            className="text-input"
            defaultValue={operation?.title}
            name="title"
            required
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Operation Type</span>
          <select
            className="text-input"
            defaultValue={operation?.operationType || "FLEET"}
            name="operationType"
          >
            {operationTypeOptions.map((type) => (
              <option key={type} value={type}>
                {formatStatusLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Status</span>
          <select
            className="text-input"
            defaultValue={operation?.status || "PLANNED"}
            name="status"
          >
            {operationStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Scheduled For</span>
          <input
            className="text-input"
            defaultValue={toDateInputValue(operation?.scheduledFor)}
            name="scheduledFor"
            type="datetime-local"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Location</span>
          <input
            className="text-input"
            defaultValue={operation?.location}
            name="location"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Doctrine</span>
          <input
            className="text-input"
            defaultValue={operation?.doctrine}
            name="doctrine"
          />
        </label>
      </div>

      <label className="field-stack">
        <span className="field-label">Description</span>
        <textarea
          className="text-input"
          defaultValue={operation?.description}
          name="description"
          rows={4}
        />
      </label>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value audit-meta-value">{value}</div>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toDateInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 16);
}
