/**
 * Body for PUT /notification-permission — LOCKED typed DTO (no `any`).
 * `userId` is server-set (never trusted from the client).
 */

export interface NotificationFlags {
  pushNotification: boolean;
  emailNotification: boolean;
  smsNotification: boolean;
  appNotification: boolean;
}

export interface ReceiveFromInput {
  friends?: boolean;
  followers?: boolean;
  public?: boolean;
}

export interface SectionNotificationInput extends NotificationFlags {
  key: string;
  label?: string;
  sendNotificationOnAddingNew?: boolean;
  sendNotificationOnChange?: boolean;
}

export interface NotificationPermissionInput {
  /** Current authenticated user (server-set). */
  userId: string;
  generalNotification?: NotificationFlags;
  receiveFrom?: ReceiveFromInput;
  sectionNotifications?: SectionNotificationInput[];
}
