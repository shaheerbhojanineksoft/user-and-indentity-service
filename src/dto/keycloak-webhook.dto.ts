export const LOG_TYPES = {
  LOGIN: "access.LOGIN",
  REGISTER: "access.REGISTER",
  CODE_TO_TOKEN: "access.CODE_TO_TOKEN",
  SEND_VERIFY_EMAIL: "access.SEND_VERIFY_EMAIL",
  VERIFY_EMAIL: "access.VERIFY_EMAIL",
} as const;

export type LogType = (typeof LOG_TYPES)[keyof typeof LOG_TYPES];

export interface AuthDetails {
  realmId?: string;
  clientId?: string; // which client the user registered from (used as registeredFrom)
  userId?: string; // Keycloak user UUID — primary key for lookup/creation
  ipAddress?: string;
  username?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface WebhookDetails {
  auth_method?: string;
  auth_type?: string;
  response_type?: string;
  redirect_uri?: string;
  consent?: string;
  code_id?: string;
  username?: string; // preferred username
  response_mode?: string;
  // registration-specific
  register_method?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  // token-specific
  token_id?: string;
  grant_type?: string;
  refresh_token_type?: string;
  scope?: string;
  refresh_token_id?: string;
  client_auth_method?: string;
  [key: string]: unknown;
}

export interface KeycloakWebhookDTO {
  id?: string;
  time?: number; // epoch ms
  realmId?: string;
  realmName?: string;
  uid?: string;
  type: LogType;
  authDetails?: AuthDetails;
  details?: WebhookDetails;
  /** Only added by the webhook handler (REGISTER only) before forwarding. */
  initialConfiguration?: Record<string, any>;
  [key: string]: unknown;
}
