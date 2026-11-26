import { limit, route } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { uploadMetadata } from "@/lib/launch.ts";

/** Upload image + metadata to IPFS. Requires a signed-in wallet; 2 MB image limit. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  limit(`upload:${wallet}`, 6, 3600_000);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) throw new HttpError(400, "Image is required");
  if (file.size > 2_000_000) throw new HttpError(413, "Image must be under 2 MB");
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new HttpError(400, "Use a PNG, JPEG, GIF or WebP image");
  const out = new FormData();
  out.append("file", file, "image");
  for (const k of ["name", "symbol", "description", "twitter", "telegram", "website"]) {
    const v = form.get(k);
    if (typeof v === "string" && v.length <= 1000) out.append(k, v);
  }
  out.append("showName", "true");
  return { uri: await uploadMetadata(out) };
});
