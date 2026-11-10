// Approval: fingerprint the final ad text, save it to approved/, and publish a copy to live/ (the stand-in ad platform).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adText } from "./lint";
import { ApprovedAd, type AdVariant, type LiveAd, type ProductType } from "./schemas";

export const DIRS = { approved: "approved", live: "live" };

export const normalize = (s: string) => s.trim().replace(/\s+/g, " ");

export function fingerprint(ad: Pick<AdVariant, "headline" | "primary_text" | "cta">): string {
  return createHash("sha256").update(normalize(adText(ad))).digest("hex");
}

export function approve(variant: AdVariant, productType: ProductType, runId: string, dirs = DIRS): ApprovedAd {
  const record = ApprovedAd.parse({
    ad_id: `${runId}-${variant.id}`,
    run_id: runId,
    variant,
    product_type: productType,
    fingerprint: fingerprint(variant),
    approved_at: new Date().toISOString(),
  });
  const live: LiveAd = { ad_id: record.ad_id, headline: variant.headline, primary_text: variant.primary_text, cta: variant.cta };
  mkdirSync(dirs.approved, { recursive: true });
  mkdirSync(dirs.live, { recursive: true });
  writeFileSync(join(dirs.approved, `${record.ad_id}.json`), JSON.stringify(record, null, 2) + "\n");
  writeFileSync(join(dirs.live, `${record.ad_id}.json`), JSON.stringify(live, null, 2) + "\n");
  return record;
}
