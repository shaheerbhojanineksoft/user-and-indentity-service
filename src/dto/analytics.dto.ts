/** Identity + payload needed to fire analytics events (GA4 / AppsFlyer / Meta CAPI). */
export interface AnalyticsIdentity {
  type: string;
  userId: string;
  time: number;
  platform?: string;
  fbId?: string; // firebase app_instance_id → GA4
  afId?: string; // appsflyer_id → AppsFlyer
  madId?: string; // meta advertising id → Meta CAPI
  clientId?: string; // Keycloak client (utm_source)
}
