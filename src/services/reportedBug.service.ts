import { randomUUID } from "node:crypto";

import type { CreateReportedBugInput } from "../dto/create-reported-bug.dto";
import {
  countReportedBugsByOwner,
  findReportedBugsByOwner,
  upsertReportedBug,
} from "../repositories/reportedBug.repo";

/**
 * Business logic for POST /reported-bug (per spec — exact, no improvisation).
 *
 * Self-contained in the webapi layer (no separate TCP listener): reads the
 * current authenticated user (ownerId), builds the ReportedBug entity and
 * writes it DIRECTLY to Mongo. NO notification / scheduler / helpdesk / slack
 * side-effects (dead legacy code is not reproduced).
 */
export async function addReportedBug(dto: CreateReportedBugInput, ownerId: string) {
  try {
    const doc = {
      // The model's initial _id (timestamp string) is dropped first; the
      // persisted key is a random UUID.
      _id: randomUUID(),
      title: dto.title,
      description: dto.description,
      mediaUrl: [...dto.mediaUrl], // copy of the array
      status: "PENDING", // ReportedBugStatus.PENDING — forced, never from client
      section: dto.section,
      page: dto.page,
      ownerId, // current authenticated user id (request context)
      createdOn: Date.now(),
      modifiedOn: Date.now(),
      createdBy: "System",
      modifiedBy: "System",
      isDeleted: false,
    };

    const saved = await upsertReportedBug(doc);

    return { isSuccess: true, data: saved, message: "Reported bug created successfully" };
  } catch {
    return { isSuccess: false, data: null, message: "Failed to create reported bug" };
  }
}

/**
 * Business logic for GET /reported-bug (per spec — exact, no improvisation).
 * Self-contained in the webapi layer: lists the CURRENT user's own reported
 * bugs (ownerId = userId), sorted createdOn desc, paginated, with a full
 * totalCount. Empty result is NOT an error — returns data {} with its own
 * message. NO notification / scheduler / helpdesk / slack side-effects.
 */
export async function getReportedBugTickets(page: number, pageSize: number, ownerId: string) {
  try {
    const skip = (page - 1) * pageSize;

    const bugs = await findReportedBugsByOwner(ownerId, skip, pageSize);
    const totalCount = await countReportedBugsByOwner(ownerId);

    if (bugs.length > 0) {
      return {
        isSuccess: true,
        data: { bugs, totalCount },
        message: "Reported bugs retrieved successfully",
      };
    }

    return { isSuccess: false, data: {}, message: "No reported bugs found" };
  } catch {
    return { isSuccess: false, data: null, message: "Failed to retrieve reported bugs" };
  }
}
