/** Request body for POST /reported-bug (source: CreateReportedBugDto). */
export interface CreateReportedBugInput {
  title: string;
  description: string;
  /** Image/video URLs attached to the report (may be []). */
  mediaUrl: string[];
  page: string;
  section: string;
}
