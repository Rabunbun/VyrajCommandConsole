import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CorpAccessDenied } from "@/components/corp-access-denied";
import { SrpQueueBoard } from "@/components/srp-queue-board";
import { SrpRequestForm } from "@/components/srp-request-form";
import { getCorpPortalAccessContext } from "@/lib/corp-portal-access";
import {
  getSrpPageData,
  type SrpCorpView
} from "@/lib/modules/srp";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type SrpPageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function SrpPage({ params, searchParams }: SrpPageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();
  const access = await getCorpPortalAccessContext(corpSlug, { session });

  if (!access.corp) {
    notFound();
  }

  if (!access.allowed) {
    if (access.loginRequired) {
      redirect("/login");
    }

    return <CorpAccessDenied access={access} moduleName="SRP Requests" />;
  }

  const result = await getSrpPageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="SRP Unavailable"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="SRP Requests Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <SrpHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />

      <SrpRequestForm corp={result.corp} shipTypes={result.shipTypes} />

      {result.canReviewSrp ? (
        <SrpQueueBoard
          corp={result.corp}
          requests={result.requests}
          shipTypes={result.shipTypes}
        />
      ) : null}
    </div>
  );
}

function SrpHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: SrpCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Member Module</div>
      <h1 className="page-title">SRP Requests</h1>
      <p className="page-copy">
        Submit ship replacement requests for {corp.name}. Include the character,
        ship type, killmail link if available, requested payout amount, and any
        context officers need to review the loss.
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
  corp?: SrpCorpView;
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
  const sanitizedError = sanitizeQueryMessage(error, "error");
  const sanitizedSuccess = sanitizeQueryMessage(success, "success");

  if (!sanitizedSuccess && !sanitizedError) {
    return null;
  }

  return (
    <div className={sanitizedError ? "error-state" : "success-state"} role="status">
      {sanitizedError || sanitizedSuccess}
    </div>
  );
}

function sanitizeQueryMessage(
  message: string | undefined,
  type: "success" | "error"
) {
  if (!message) {
    return "";
  }

  const trimmed = message.trim();

  if (!trimmed) {
    return "";
  }

  if (isTechnicalFrameworkMessage(trimmed)) {
    return type === "error"
      ? "Action could not be completed. Please try again."
      : "";
  }

  return trimmed;
}

function isTechnicalFrameworkMessage(message: string) {
  return /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/i.test(message) ||
    /digest:/i.test(message);
}
