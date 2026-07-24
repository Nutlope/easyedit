export type QuotaRejectedFeature = "image-edit" | "suggested-prompts";
export type QuotaRejectedRoute = "generateImage" | "/api/suggested-prompts";

export function buildQuotaRejectionTrace({
  feature,
  route,
  resetAt,
}: {
  feature: QuotaRejectedFeature;
  route: QuotaRejectedRoute;
  resetAt: number;
}) {
  return {
    metadata: {
      feature,
      route,
      phase: "rate-limit",
      outcome: "quota-rejected",
      success: false,
      byok: false,
      resetAt,
    },
  };
}
