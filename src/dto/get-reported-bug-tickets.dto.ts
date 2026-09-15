/** Query params for GET /reported-bug (source: getTickets pagination). */
export interface GetReportedBugTicketsQuery {
  /** Page number (1-based). skip = (page - 1) * pageSize. */
  page: number;
  /** Items per page (the limit). */
  pageSize: number;
}
