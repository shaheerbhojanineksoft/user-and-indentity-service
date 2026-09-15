/** DTO built inside the signup routine (matches the source multi-register flow). */
export interface MultiRegisterDTO {
  fullName: string;
  userName: string;
  signUpRef?: string;
  email?: string;
  password?: string; // EMPTY for Keycloak users
  registeredFrom?: string;
  country?: string;
  [key: string]: any; // spreads all seeded initialConfiguration defaults
}
