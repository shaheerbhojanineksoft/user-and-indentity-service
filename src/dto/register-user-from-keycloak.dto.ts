/** Payload used to create a user from a Keycloak REGISTER webhook. */
export interface RegisterUserFromKeycloakDTO {
  userId: string; // Keycloak UUID → used as Mongo _id
  email?: string;
  firstName?: string;
  userName?: string;
  lastName?: string;
  signUpRef?: string;
  registeredFrom?: string; // from authDetails.clientId
  initialConfiguration?: Record<string, any>;
  country?: string;
}
