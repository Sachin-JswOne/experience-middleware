/**
 * MoEngage <> HubSpot integration config.
 *
 * HubSpot workflow webhooks emit FLAT key-value JSON. MoEngage's Data API (the
 * S2S "Track Event" endpoint) expects a NESTED `actions[]` payload with
 * `type: "event"`. The transformers in `moengage.transformers.ts` bridge that.
 *
 * We target the MoEngage **Data API** — verified to actually store events —
 * NOT the `/partner/hubspot-crm/...` connector endpoint, which returns 200 but
 * does not persist.
 *
 *   POST https://api-{dc}.moengage.com/v1/event/{WorkspaceID}
 *   Authorization: Basic base64(WorkspaceID:DataAPIKey)
 *
 * Defaults target the DC-03 test workspace (JSW_One_HomesMoeTest, the `_DEBUG`
 * test environment). Override any value with a real env var for other envs.
 */
export const MOENGAGE_HUBSPOT = {
  /**
   * Full MoEngage Data API event endpoint, including the workspace id in the
   * path. For prod, swap the DC and drop the `_DEBUG` suffix from the workspace.
   */
  dataApiUrl:
    process.env.MOENGAGE_DATA_API_URL ||
    'https://api-03.moengage.com/v1/event/4311B84VU6UTCNRSAT5JZ3RV_DEBUG',

  /**
   * Full Authorization header value: "Basic base64(WorkspaceID:DataAPIKey)".
   * Same credentials as the partner endpoint. Prefer supplying via env var.
   */
  authHeader:
    process.env.MOENGAGE_HUBSPOT_AUTH ||
    'Basic NDMxMUI4NFZVNlVUQ05SU0FUNUpaM1JWX0RFQlVHOkxMYjFAVzN5WHJjSjZzS1VRSGpQUXF0Xw==',
};
