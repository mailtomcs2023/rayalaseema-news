// Single source of truth for "has this reporter finished onboarding their
// personal details?". Used by /api/reporter/login and /api/reporter/profile
// to tell the Expo app whether to land the user on the Home screen (banner
// says "Upload documents") or on the Complete-Registration flow (banner
// says "Complete registration").
//
// A profile is considered registration-complete when the reporter has filled
// in the personal-details step of registration. We don't gate on KYC docs or
// bank details here - those have their own status (kycStatus) and their own
// banner state. The check is intentionally narrow: it's the difference
// between "admin only typed name + email" and "the reporter has filled in
// their own personal details at some point".
//
// Phone is on the User row (admin-creation only fills it sometimes), so we
// rely on profile-only fields the admin-create form does not collect:
// dateOfBirth, address, pincode. If all three are set, registration is done.

type RegistrationProfileShape = {
  dateOfBirth?: Date | null;
  address?: string | null;
  pincode?: string | null;
} | null | undefined;

export function isRegistrationComplete(profile: RegistrationProfileShape): boolean {
  if (!profile) return false;
  return !!(profile.dateOfBirth && profile.address && profile.pincode);
}
