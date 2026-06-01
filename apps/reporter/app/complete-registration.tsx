import React from "react";
import { RegisterScreen } from "../src/screens/RegisterScreen";

// Entry route for the "Complete registration" flow.
//
// Reached from the KycBanner CTA when the reporter was created in the
// admin portal (name + email seeded, everything else empty). Reuses
// RegisterScreen with mode="complete", which locks the email field,
// hides the password / email-confirm fields, and submits to the
// authenticated /api/reporter/complete-registration endpoint.
export default function CompleteRegistration() {
  return <RegisterScreen mode="complete" />;
}
