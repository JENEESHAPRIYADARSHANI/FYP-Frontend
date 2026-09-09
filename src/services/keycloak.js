import Keycloak from "keycloak-js";

export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
export const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || "hastha";
export const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "hastha";

// One instance for the app's lifetime — re-creating it on every render would
// spawn a fresh silent-SSO iframe check each time.
const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID,
});

export default keycloak;
