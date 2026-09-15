/**
 * Request body for PUT /users/updateConfiguration.
 * Matches the source `UpdateConfiguration` DTO exactly.
 */
export interface UpdateConfiguration {
  activitiesCount: number;
  widgetsCount: number;
  maxWidth: string;
  activitiesWidth: string;
  widgetsWidth: string;
  totalColumns: number;
  showWidgets: boolean;
  showTimeline: boolean;
}
