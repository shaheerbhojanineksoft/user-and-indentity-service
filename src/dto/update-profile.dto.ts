/** Request body for PUT /users/updateprofile (source: UpdateProfileDTO). */
export interface UpdateProfileDTO {
  profilePicture: string;
  fullName: string;
  userName: string;
  email: string;
  phoneNumber: string;
  coverPhoto: string;
}
