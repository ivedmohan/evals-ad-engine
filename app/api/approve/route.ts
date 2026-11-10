// POST { run_id, product_type, variant, verdict } -> writes approved/<ad_id>.json and live/<ad_id>.json
import { z } from "zod";
import { approve } from "@/src/core/approve";
import { AdVariant, ProductType, Verdict } from "@/src/core/schemas";

const Body = z.object({ run_id: z.string().regex(/^run_[a-f0-9]{8}$/), product_type: ProductType, variant: AdVariant, verdict: Verdict });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid approval request" }, { status: 400 });
  const { run_id, product_type, variant, verdict } = parsed.data;
  if (verdict === "block") return Response.json({ error: "blocked ads cannot be approved" }, { status: 409 });
  return Response.json(approve(variant, product_type, run_id));
}
