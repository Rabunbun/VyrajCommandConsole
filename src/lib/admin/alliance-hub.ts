import "server-only";
import {
  AllianceContentPriority,
  AllianceContentType,
  ContentAudience,
  ContentStatus
} from "@prisma/client";
import { getDb } from "@/lib/db";

export const allianceContentTypeOptions = [
  AllianceContentType.ANNOUNCEMENT,
  AllianceContentType.ALERT,
  AllianceContentType.PRIORITY,
  AllianceContentType.STANDING_ORDER,
  AllianceContentType.FEATURED_OP,
  AllianceContentType.NOTE
] as const;

export const allianceContentAudienceOptions = [
  ContentAudience.ALL_MEMBERS,
  ContentAudience.OFFICERS,
  ContentAudience.SUPER_ADMINS
] as const;

export const allianceContentPriorityOptions = [
  AllianceContentPriority.LOW,
  AllianceContentPriority.NORMAL,
  AllianceContentPriority.HIGH,
  AllianceContentPriority.CRITICAL
] as const;

export const allianceContentStatusOptions = [
  ContentStatus.ACTIVE,
  ContentStatus.DRAFT,
  ContentStatus.EXPIRED,
  ContentStatus.ARCHIVED
] as const;

export type AdminAllianceHubContentView = {
  id: string;
  contentType: AllianceContentType;
  title: string;
  body: string;
  audience: ContentAudience;
  priority: AllianceContentPriority;
  status: ContentStatus;
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AllianceHubEditorData = {
  content: AdminAllianceHubContentView[];
};

export async function getAllianceHubEditorData(): Promise<AllianceHubEditorData> {
  const content = await getDb().allianceHubContent.findMany({
    orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      contentType: true,
      title: true,
      body: true,
      audience: true,
      priority: true,
      status: true,
      startDate: true,
      endDate: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return {
    content: content.map((item) => ({
      ...item,
      startDate: item.startDate ? item.startDate.toISOString() : null,
      endDate: item.endDate ? item.endDate.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}
